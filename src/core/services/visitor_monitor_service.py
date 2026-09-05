"""Always-on entrance/exit visitor monitor.

The monitor reuses CameraService's shared stream hub, so viewing a camera in the
dashboard and background analysis do not open separate RTSP connections.
"""

import base64
import logging
import os
import pickle
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from typing import Optional

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import close_old_connections, transaction
from django.utils import timezone

from src.core.models.customer import PotentialEmployee, VisitorEvent, VisitorSession, VisitorRetentionSetting
from src.core.models.employee import Employee, EmployeeFace
from src.core.models.location import Camera, Location
from src.core.services.camera_service import CameraService
from src.core.services.face_recognition_service import FaceRecognitionService, encryption_service
from src.core.services.integration_service import IntegrationService
from src.core.services.person_detection_service import PersonDetectionService
from src.core.services.risk_scoring_service import RiskScoringService

logger = logging.getLogger(__name__)


class VisitorMonitorService:
    """Poll active entrance/exit cameras and persist visitor sessions."""

    _thread: Optional[threading.Thread] = None
    _stop_event = threading.Event()
    _thread_lock = threading.Lock()

    def __init__(self):
        self.face_service = FaceRecognitionService()
        self.person_service = PersonDetectionService()
        self.camera_service = CameraService()
        self.match_threshold = float(getattr(settings, "VISITOR_FACE_MATCH_THRESHOLD", 0.55))
        # A partially covered/turned face can have a lower embedding score.
        # This lower value is used only for a recent *same camera* track with
        # spatial continuity, never for matching two arbitrary people.
        self.track_match_threshold = float(getattr(settings, "VISITOR_TRACK_FACE_MATCH_THRESHOLD", 0.24))
        self.new_visitor_confidence = float(getattr(settings, "VISITOR_NEW_FACE_CONFIDENCE", 0.72))
        self.single_open_exit_threshold = float(getattr(settings, "VISITOR_SINGLE_OPEN_EXIT_THRESHOLD", 0.28))
        self.long_stay_minutes = int(getattr(settings, "VISITOR_LONG_STAY_MINUTES", 180))
        self.retention_hours = int(getattr(settings, "VISITOR_BIOMETRIC_RETENTION_HOURS", 24))
        # One face stays visible across many frames.  Keep a short-lived camera
        # track so those frames can never create multiple entry records.
        self._recent_tracks = {}
        self._track_ttl_seconds = 5 * 60
        # Anonymous tracks use a body box only. They are never converted into
        # biometric face embeddings and expire quickly to avoid repeat counts.
        self._recent_anonymous_tracks = {}
        self._anonymous_track_ttl_seconds = 90
        # Oxirgi qayta ishlangan kadrning yengil vizual ma'lumoti. Browser
        # shu bboxlarni video ustiga chizadi, shuning uchun bir kadr ikki marta
        # yuz tahlilidan o'tmaydi.
        self._last_detections = []
        # Xodim profilini turli burchakdagi bir nechta yuz namunalari bilan
        # boyitamiz. Bir kadr oqimi bazaga yuzlab bir xil rasm yozmasligi uchun
        # har xodimga interval saqlanadi.
        self._employee_sample_seen_at = {}
        self._employee_sample_interval_seconds = 15 * 60
        self._employee_sample_limit = 8

    @classmethod
    def start(cls):
        """Start only one monitor in this Django process."""
        if not getattr(settings, "VISITOR_MONITOR_ENABLED", True):
            return False
        with cls._thread_lock:
            if cls._thread and cls._thread.is_alive():
                return False
            cls._stop_event.clear()
            cls._thread = threading.Thread(
                target=cls().run_forever, name="visitor-monitor", daemon=True
            )
            cls._thread.start()
            logger.info("Visitor monitor started")
            return True

    @classmethod
    def stop(cls):
        cls._stop_event.set()

    def run_forever(self):
        interval = max(1, int(getattr(settings, "VISITOR_MONITOR_INTERVAL_SECONDS", 2)))
        last_cleanup = 0.0
        last_analytics_refresh = 0.0
        while not self._stop_event.is_set():
            try:
                self.process_active_cameras()
                if time.monotonic() - last_cleanup >= 3600:
                    self.purge_expired_biometrics()
                    last_cleanup = time.monotonic()
                # Kamera, xodim va Soliqdan olingan tushumni birlashtirib,
                # barcha Asaka lokatsiyalari uchun risk avtomatik yangilanadi.
                if time.monotonic() - last_analytics_refresh >= 15 * 60:
                    self.refresh_district_analytics()
                    last_analytics_refresh = time.monotonic()
            except Exception:
                logger.exception("Visitor monitor cycle failed")
            finally:
                close_old_connections()
            self._stop_event.wait(interval)

    def refresh_district_analytics(self):
        """Faol lokatsiyalar uchun kunlik soliq/visitor analitikasini yangilaydi."""
        now = timezone.now()
        # Avval qo'lda yaratilgan xodimlar ham bugungi mos tashriflardan
        # xodimga aylantiriladi; ular mijoz bo'lib qolib ketmaydi.
        self.face_service.reconcile_recent_employee_visitors()
        risk_service = RiskScoringService()
        integration_service = IntegrationService()
        try:
            for location in Location.objects.filter(is_active=True).only("id", "tax_id"):
                # Real API sozlangan bo'lsa, kuniga kamida bir marta tushumni oladi.
                # Sozlanmagan tizimda bu qadam o'tkazib yuboriladi va kamera
                # analitikasi ishlashda davom etadi.
                if location.tax_id and IntegrationService.tax_sync_is_configured():
                    integration_service.sync_tax_data_sync(location.id, location.tax_id)
                risk_service.refresh_daily_analytics_sync(location.id, now)
        finally:
            # __init__ dagi async clientlar ochiq qolmasligi uchun yopamiz.
            try:
                import asyncio
                asyncio.run(integration_service.close_connections())
            except Exception:
                pass

    def process_active_cameras(self):
        cameras = list(Camera.objects.filter(
            is_active=True, camera_type__in=["entrance", "exit"]
        ).exclude(stream_url__isnull=True).exclude(stream_url="").select_related("location"))
        if not cameras:
            return

        # Kadrlar parallel olinadi. Avvalgi ketma-ket usulda 4 kamera bo‘lsa,
        # oxirgi kamera navbat kutib qolishi mumkin edi.
        workers = min(len(cameras), max(1, int(getattr(settings, "VISITOR_MONITOR_CAPTURE_WORKERS", 4))))
        frames = []
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="visitor-capture") as executor:
            futures = {
                executor.submit(self.camera_service.capture_frame, camera.stream_url, 1): camera
                for camera in cameras
            }
            for future in as_completed(futures):
                camera = futures[future]
                try:
                    result = future.result()
                except Exception as exc:
                    logger.debug("Camera frame capture failed for %s: %s", camera.id, exc)
                    continue
                frame = result.get("frame") if result.get("success") else None
                if frame is not None:
                    frames.append((camera, frame))

        # DB/yuz ma’lumotlari bilan ishlash bitta monitor oqimida qoladi.
        for camera, frame in frames:
            self.process_frame(camera, frame)

    def process_frame(self, camera: Camera, frame) -> int:
        """Yuzi ko‘ringan yoki anonim odam uchun tashrif qaydini yuritadi."""
        processed = 0
        now = timezone.now()
        self._last_detections = []
        faces = self.face_service.detect_faces(frame)[:5]
        for face in faces:
            x1, y1, x2, y2 = face.get("bbox", [0, 0, 0, 0])
            crop = frame[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
            if crop is None or crop.size == 0 or min(crop.shape[:2]) < 40:
                continue
            embedding = face.get("embedding")
            if embedding is None:
                embedding = self.face_service._encode_face(crop)
            if embedding is None:
                # Vizual ramka yuz aniqlanishi bilan darhol chiqadi. Embedding
                # bo'lmasa faqat hisobotga yangi ID yozilmaydi.
                self._last_detections.append({
                    "bbox": list(face.get("bbox", [])),
                    "label": "Odam",
                    "is_employee": False,
                })
                continue
            known_session = self._recent_camera_session(
                camera.id, face.get("bbox", []), np.asarray(embedding), now
            )
            if known_session is not None:
                known = VisitorSession.objects.select_related("employee").filter(pk=known_session).first()
                # Bir odam chiqib, yana kirsa (hatto 5 daqiqa ichida bo'lsa
                # ham), avvalgi qisqa camera-track uni yutib yubormaydi.
                if known and camera.camera_type == "entrance" and (
                    known.status == "completed" or known.entered_at.date() != now.date()
                ):
                    recognition = self.face_service.recognize_face_sync(
                        crop, camera.location_id, embedding=np.asarray(embedding)
                    )
                    session = self._register_entry(camera, crop, np.asarray(embedding), recognition, now)
                    if session is not None:
                        self._remember_camera_session(
                            camera.id, face.get("bbox", []), np.asarray(embedding), session.id, now
                        )
                        self._capture_employee_face_sample(camera, session, crop, np.asarray(embedding), now)
                    self._last_detections.append({
                        "bbox": list(face.get("bbox", [])),
                        # Xodim bo'lsa faqat uning F.I.Sh. chiqadi; aks holda
                        # bu oddiy mijoz. Vaqtinchalik ID hech qachon overlayga
                        # chiqarilmaydi.
                        "label": recognition.get("employee_name") or "Xodim" if recognition.get("is_employee") else "Mijoz",
                        "is_employee": bool(recognition.get("is_employee")),
                    })
                    processed += 1
                    continue

                # Chiqish kamerasining o'z tracki avvalgi chiqishdan qolishi
                # mumkin. Odam keyin yana kirib shu sessiyani qayta ochsa,
                # trackni faqat last_seen yangilash bilan cheklab bo'lmaydi —
                # ikkinchi chiqishni ham darhol yopish kerak.
                if known and camera.camera_type == "exit" and known.status == "inside":
                    session = self._register_exit(camera, crop, np.asarray(embedding), now, matched_session=known)
                    if session is not None:
                        self._capture_employee_face_sample(camera, session, crop, np.asarray(embedding), now)
                        is_employee = bool(session.is_employee and session.employee_id)
                        employee_name = session.employee.full_name if is_employee and session.employee else "Xodim"
                        self._last_detections.append({
                            "bbox": list(face.get("bbox", [])),
                            "label": employee_name if is_employee else "Mijoz",
                            "is_employee": is_employee,
                        })
                        processed += 1
                    continue

                VisitorSession.objects.filter(pk=known_session, status="inside").update(
                    last_seen_at=now, updated_at=now
                )
                if known and known.is_employee and known.employee:
                    self._capture_employee_face_sample(camera, known, crop, np.asarray(embedding), now)
                    label = known.employee.full_name
                    is_employee = True
                else:
                    label = "Mijoz"
                    is_employee = False
                self._last_detections.append({"bbox": list(face.get("bbox", [])), "label": label, "is_employee": is_employee})
                continue
            # Kirishda noaniq/yarim yuzga yangi ID bermaymiz. Chiqishda esa
            # bunday yuz ham oldindan ochiq bo'lgan tashrif bilan qiyoslanishi
            # kerak: aynan shu qadam avval chiqishni umuman yopmay qo'yardi.
            if camera.camera_type == "entrance" and float(face.get("confidence", 0.0)) < self.new_visitor_confidence:
                # Kadrda yuz darhol ko'rinadi, lekin noaniq yuzga yangi ID
                # bermaymiz. Bu tez ko'rinish va noto'g'ri hisobdan himoyani
                # birga saqlaydi.
                self._last_detections.append({"bbox": list(face.get("bbox", [])), "label": "Odam", "is_employee": False})
                continue
            recognition = self.face_service.recognize_face_sync(
                crop, camera.location_id, embedding=np.asarray(embedding)
            ) if camera.camera_type == "entrance" else {}
            if camera.camera_type == "entrance":
                session = self._register_entry(camera, crop, np.asarray(embedding), recognition, now)
            else:
                session = self._register_exit(camera, crop, np.asarray(embedding), now)
            if session is not None:
                self._remember_camera_session(
                    camera.id, face.get("bbox", []), np.asarray(embedding), session.id, now
                )
                self._capture_employee_face_sample(camera, session, crop, np.asarray(embedding), now)
            # Chiqishda yuz avval ochiq sessiyaga mos kelsa, u yerda saqlangan
            # xodim biriktirishidan foydalanamiz. Shu bilan chiqish kartasida
            # xodim "Mijoz" deb ko'rinib qolmaydi.
            is_employee = bool(recognition.get("is_employee"))
            label = recognition.get("employee_name") or "Xodim" if is_employee else "Mijoz"
            if session is not None and session.is_employee and session.employee_id:
                is_employee = True
                label = session.employee.full_name if session.employee else "Xodim"
            self._last_detections.append({
                "bbox": list(face.get("bbox", [])),
                "label": label,
                "is_employee": is_employee,
            })
            processed += 1

        # Face detector hech qanday yuz topmasa ham, odam detektori orqali
        # kirish/chiqishni "Anonim" sifatida qayd etamiz. Bu shlyapa, niqob,
        # yon tomonga qarash yoki kamera burchagi sabab yo‘qolgan tashriflarni
        # hisobdan chiqarib yubormaydi.
        if not faces:
            for person in self.person_service.detect_persons_sync(frame)[:5]:
                x1, y1, x2, y2 = person.get("bbox", [0, 0, 0, 0])
                crop = frame[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
                if crop is None or crop.size == 0 or min(crop.shape[:2]) < 80:
                    continue
                session = self._register_anonymous(camera, crop, person.get("bbox", []), now)
                self._last_detections.append({"bbox": list(person.get("bbox", [])), "label": "Anonim odam", "is_employee": False})
                if session is not None:
                    processed += 1
        return processed

    def get_latest_detections(self):
        """Browser overlayi uchun shu kadrning yuz/odam ramkalari."""
        return list(self._last_detections)

    @staticmethod
    def _bbox_iou(first, second) -> float:
        if len(first) != 4 or len(second) != 4:
            return 0.0
        ax1, ay1, ax2, ay2 = first
        bx1, by1, bx2, by2 = second
        intersection = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
        union = max(1, (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - intersection)
        return intersection / union

    @staticmethod
    def _bbox_center_distance(first, second) -> float:
        """Two face boxes' centre distance in pixels."""
        if len(first) != 4 or len(second) != 4:
            return float("inf")
        first_center = ((first[0] + first[2]) / 2, (first[1] + first[3]) / 2)
        second_center = ((second[0] + second[2]) / 2, (second[1] + second[3]) / 2)
        return float(np.hypot(first_center[0] - second_center[0], first_center[1] - second_center[1]))

    @staticmethod
    def _bbox_scale(bbox) -> float:
        if len(bbox) != 4:
            return 0.0
        return max(1.0, float(max(bbox[2] - bbox[0], bbox[3] - bbox[1])))

    def _recent_camera_session(self, camera_id: int, bbox, embedding: np.ndarray, now) -> Optional[int]:
        tracks = self._recent_tracks.get(camera_id, [])
        alive = [track for track in tracks if (now - track["seen_at"]).total_seconds() <= self._track_ttl_seconds]
        self._recent_tracks[camera_id] = alive
        target = embedding.astype(np.float32).flatten()
        for track in alive:
            known = track.get("embedding")
            similarity = 0.0
            if known is not None and known.shape == target.shape:
                similarity = float(np.dot(known, target) / ((np.linalg.norm(known) * np.linalg.norm(target)) + 1e-8))
            overlap = self._bbox_iou(track["bbox"], bbox)
            # When a person turns their head or covers part of the face, SFace
            # similarity can temporarily drop.  If it is the same nearby face
            # in the same short-lived camera track, preserve its existing ID.
            nearby = self._bbox_center_distance(track["bbox"], bbox) <= (
                max(self._bbox_scale(track["bbox"]), self._bbox_scale(bbox)) * 2.0
            )
            recently_seen = (now - track["seen_at"]).total_seconds() <= 45
            continuous_partial_face = recently_seen and nearby and similarity >= self.track_match_threshold
            if overlap >= 0.15 or similarity >= self.match_threshold or continuous_partial_face:
                track["bbox"] = list(bbox)
                # Do not replace a good canonical vector with an uncertain,
                # half-covered face vector.
                if similarity >= self.match_threshold:
                    track["embedding"] = target
                track["seen_at"] = now
                return track["session_id"]
        return None

    def _remember_camera_session(self, camera_id: int, bbox, embedding: np.ndarray, session_id: int, now):
        if len(bbox) != 4:
            return
        self._recent_tracks.setdefault(camera_id, []).append(
            {"bbox": list(bbox), "embedding": embedding.astype(np.float32).flatten(), "session_id": session_id, "seen_at": now}
        )

    def _recent_anonymous_session(self, camera_id: int, bbox, now) -> Optional[int]:
        tracks = self._recent_anonymous_tracks.get(camera_id, [])
        alive = [track for track in tracks if (now - track["seen_at"]).total_seconds() <= self._anonymous_track_ttl_seconds]
        self._recent_anonymous_tracks[camera_id] = alive
        for track in alive:
            overlap = self._bbox_iou(track["bbox"], bbox)
            nearby = self._bbox_center_distance(track["bbox"], bbox) <= max(self._bbox_scale(track["bbox"]), self._bbox_scale(bbox)) * 1.5
            if overlap >= 0.20 or nearby:
                track["bbox"] = list(bbox)
                track["seen_at"] = now
                return track["session_id"]
        return None

    def _remember_anonymous_session(self, camera_id: int, bbox, session_id: int, now):
        if len(bbox) == 4:
            self._recent_anonymous_tracks.setdefault(camera_id, []).append(
                {"bbox": list(bbox), "session_id": session_id, "seen_at": now}
            )

    def _serialize_embedding(self, embedding: np.ndarray) -> str:
        encoded = base64.b64encode(pickle.dumps(embedding.astype(np.float32))).decode()
        return encryption_service.encrypt(encoded)

    def _deserialize_embedding(self, value: str) -> Optional[np.ndarray]:
        try:
            raw = encryption_service.decrypt(value) or value
            return np.asarray(pickle.loads(base64.b64decode(raw)), dtype=np.float32).flatten()
        except Exception:
            return None

    def _find_open_session(self, location_id: int, embedding: np.ndarray) -> Optional[VisitorSession]:
        strict_match = self._find_recent_session(location_id, embedding, open_only=True)
        if strict_match is not None:
            return strict_match

        # Exit camera must be able to close a real entry even if the person is
        # now turned sideways.  A lower threshold is safe only when there is
        # exactly one open visitor in that location; with two people we refuse
        # to guess and wait for a clearer face instead.
        candidates = list(
            VisitorSession.objects.filter(
                location_id=location_id,
                status="inside",
                entered_at__gte=timezone.now() - timedelta(hours=self.retention_hours),
            ).exclude(face_embedding="")[:2]
        )
        if len(candidates) != 1:
            return None
        known = self._deserialize_embedding(candidates[0].face_embedding)
        target = embedding.astype(np.float32).flatten()
        if known is None or known.shape != target.shape:
            return None
        if len(target) == 128:
            score = float(np.dot(known, target) / ((np.linalg.norm(known) * np.linalg.norm(target)) + 1e-8))
        else:
            score = max(0.0, 1.0 - float(np.linalg.norm(known - target)) / 10.0)
        return candidates[0] if score >= self.single_open_exit_threshold else None

    def _find_recent_session(self, location_id: int, embedding: np.ndarray, open_only: bool = False, same_day: bool = False) -> Optional[VisitorSession]:
        cutoff = timezone.now() - timedelta(hours=self.retention_hours)
        candidates = VisitorSession.objects.filter(location_id=location_id, entered_at__gte=cutoff)
        if same_day:
            candidates = candidates.filter(entered_at__date=timezone.localdate())
        if open_only:
            candidates = candidates.filter(status="inside")
        candidates = candidates.exclude(face_embedding="").order_by("-last_seen_at")
        target = embedding.astype(np.float32).flatten()
        best, best_score = None, -1.0
        for session in candidates[:300]:
            known = self._deserialize_embedding(session.face_embedding)
            if known is None or known.shape != target.shape:
                continue
            if len(target) == 128:
                score = float(np.dot(known, target) / ((np.linalg.norm(known) * np.linalg.norm(target)) + 1e-8))
            else:
                score = max(0.0, 1.0 - float(np.linalg.norm(known - target)) / 10.0)
            if score > best_score:
                best, best_score = session, score
        return best if best_score >= self.match_threshold else None

    def _save_snapshot(self, image, visitor_id: str, camera_type: str, location_id: int) -> str:
        signature = f"{visitor_id}_{camera_type}_{timezone.now():%H%M%S}"
        return self.face_service._save_face_image(image, signature, location_id) or ""

    def _capture_employee_face_sample(self, camera: Camera, session: VisitorSession, crop, embedding: np.ndarray, now) -> None:
        """Tanilgan xodimga kamida bir nechta doimiy yuz namunasi saqlaydi.

        Bu faqat allaqachon xodim profiliga bog'langan yuz uchun ishlaydi.
        Oddiy mijoz yoki ID-si buzilgan eski yozuv hech qachon xodimga
        aylantirilmaydi. Namuna soni cheklangan va kadr oqimi ichida bir xil
        rasmlar ko'payib ketmaydi.
        """
        employee_id = session.employee_id
        if not session.is_employee or not employee_id or crop is None or crop.size == 0:
            return
        last_seen = self._employee_sample_seen_at.get(employee_id)
        if last_seen and (now - last_seen).total_seconds() < self._employee_sample_interval_seconds:
            return
        employee = Employee.objects.filter(pk=employee_id, location_id=camera.location_id, is_active=True).first()
        if employee is None:
            return
        existing_count = EmployeeFace.objects.filter(employee_id=employee_id).count()
        if existing_count >= self._employee_sample_limit:
            self._employee_sample_seen_at[employee_id] = now
            return
        try:
            serialized = self._serialize_embedding(np.asarray(embedding, dtype=np.float32))
            path = self._save_snapshot(crop, f"employee-{employee_id}", "reference", camera.location_id)
            if not path:
                return
            EmployeeFace.objects.create(
                employee_id=employee_id,
                face_encoding=serialized,
                image_path=path,
                confidence=1.0,
            )
            employee.face_embedding = serialized
            employee.save(update_fields=["face_embedding", "updated_at"])
            cache.delete(f"face_encodings_{camera.location_id}")
            self._employee_sample_seen_at[employee_id] = now
            logger.info("Employee %s received face sample %s/%s", employee_id, existing_count + 1, self._employee_sample_limit)
        except Exception:
            logger.exception("Employee face sample could not be saved for %s", employee_id)

    @transaction.atomic
    def _register_anonymous(self, camera: Camera, crop, bbox, now) -> Optional[VisitorSession]:
        recent_id = self._recent_anonymous_session(camera.id, bbox, now)
        if recent_id:
            VisitorSession.objects.filter(pk=recent_id, status="inside").update(last_seen_at=now, updated_at=now)
            return None

        if camera.camera_type == "exit":
            # Yuz bo‘lmagan chiqishni taxmin qilmaymiz. Faqat shu lokatsiyada
            # ayni damda bitta anonim odam ichkarida bo‘lsa, uni xavfsiz yopish mumkin.
            candidates = list(VisitorSession.objects.filter(
                location_id=camera.location_id, status="inside", is_anonymous=True,
                entered_at__gte=now - timedelta(hours=self.retention_hours),
            ).order_by("-last_seen_at")[:2])
            if len(candidates) != 1:
                return None
            session = candidates[0]
            session.exit_camera = camera
            session.exited_at = now
            session.last_seen_at = now
            session.stay_duration = max(0, (now - session.entered_at).total_seconds() / 60)
            session.status = "completed"
            body_path = self._save_snapshot(crop, session.visitor_id, "anonymous_exit", camera.location_id)
            session.exit_image_path = body_path
            session.exit_body_image_path = body_path
            session.save()
            VisitorEvent.objects.create(visitor_session=session, camera=camera, event_type="exit", occurred_at=now, image_path=session.exit_image_path)
            return session

        session = VisitorSession.objects.create(
            location_id=camera.location_id,
            entry_camera=camera,
            entered_at=now,
            last_seen_at=now,
            is_anonymous=True,
            face_embedding="",
        )
        body_path = self._save_snapshot(crop, session.visitor_id, "anonymous_entry", camera.location_id)
        session.entry_image_path = body_path
        session.entry_body_image_path = body_path
        session.save(update_fields=["entry_image_path", "entry_body_image_path", "updated_at"])
        VisitorEvent.objects.create(visitor_session=session, camera=camera, event_type="entry", occurred_at=now, image_path=session.entry_image_path)
        self._remember_anonymous_session(camera.id, bbox, session.id, now)
        logger.info("Anonymous visitor %s entered location %s", session.visitor_id, camera.location_id)
        return session

    @transaction.atomic
    def _register_entry(self, camera: Camera, crop, embedding: np.ndarray, recognition, now):
        # Bir kun ichidagi qayta kirishlar bitta kartaga yig'iladi. Ammo
        # kechagi tugagan tashrif bugungi ro'yxatga yangi sessiya bo'ladi.
        session = self._find_recent_session(camera.location_id, embedding, same_day=True)
        if session:
            was_completed = session.status == "completed"
            session.last_seen_at = now
            # A person may have been registered manually after this visitor
            # session was created.  The next recognised frame promotes the
            # existing visitor record instead of leaving it as a customer.
            if recognition.get("is_employee"):
                session.is_employee = True
                session.employee_id = recognition.get("employee_id")
                session.is_long_stay = False
                employee = session.employee
                if employee and not employee.monitoring_id:
                    employee.monitoring_id = session.visitor_id
                    employee.save(update_fields=["monitoring_id", "updated_at"])
            if was_completed:
                session.status = "inside"
                session.exited_at = None
                session.exit_camera = None
                session.entry_image_path = self._save_snapshot(crop, session.visitor_id, "entry", camera.location_id)
                session.save()
                VisitorEvent.objects.create(visitor_session=session, camera=camera, event_type="entry", occurred_at=now, image_path=session.entry_image_path)
            else:
                session.save(update_fields=["last_seen_at", "is_employee", "employee", "is_long_stay", "updated_at"])
            if recognition.get("is_employee"):
                PotentialEmployee.objects.filter(visitor_session=session, status="pending").update(
                    status="registered", employee_id=recognition.get("employee_id")
                )
            self._create_potential_employee(session, now)
            return session
        session = VisitorSession.objects.create(
            location_id=camera.location_id,
            entry_camera=camera,
            entered_at=now,
            last_seen_at=now,
            face_embedding=self._serialize_embedding(embedding),
            is_employee=bool(recognition.get("is_employee")),
            employee_id=recognition.get("employee_id"),
        )
        session.entry_image_path = self._save_snapshot(
            crop, session.visitor_id, "entry", camera.location_id
        )
        session.save(update_fields=["entry_image_path", "updated_at"])
        VisitorEvent.objects.create(visitor_session=session, camera=camera, event_type="entry", occurred_at=now, image_path=session.entry_image_path)
        logger.info("Visitor %s entered location %s", session.visitor_id, camera.location_id)
        return session

    def _create_potential_employee(self, session: VisitorSession, now):
        from src.core.services.visitor_review_service import queue_long_stay
        return queue_long_stay(session, now)

    @transaction.atomic
    def _register_exit(self, camera: Camera, crop, embedding: np.ndarray, now, matched_session: Optional[VisitorSession] = None):
        # Same-camera track allaqachon bu aynan qaysi ochiq tashrif ekanini
        # tasdiqlagan bo'lsa, ikkinchi marta umumiy yuz qidiruvini qilmaymiz.
        session = matched_session or self._find_open_session(camera.location_id, embedding)
        if not session:
            return None
        # Several entry/exit pairs during one day must show only actual time
        # spent inside, not the time spent outside between two visits.
        previous_entries = list(session.events.filter(event_type="entry").order_by("occurred_at"))
        previous_exits = list(session.events.filter(event_type="exit").order_by("occurred_at"))
        total_seconds = 0.0
        for entry, exit_event in zip(previous_entries, previous_exits):
            total_seconds += max(0.0, (exit_event.occurred_at - entry.occurred_at).total_seconds())
        if previous_entries:
            total_seconds += max(0.0, (now - previous_entries[-1].occurred_at).total_seconds())
        duration = round(total_seconds / 60, 2)
        session.exit_camera = camera
        session.exited_at = now
        session.last_seen_at = now
        session.stay_duration = max(0, duration)
        # Xodimning ishlagan vaqti mijoz riski emas. Hatto eski kadrda
        # long-stay belgisi qolgan bo'lsa ham chiqishda uni tozalaymiz.
        session.is_long_stay = (not session.is_employee) and duration >= self.long_stay_minutes
        session.status = "completed"
        session.exit_image_path = self._save_snapshot(
            crop, session.visitor_id, "exit", camera.location_id
        )
        session.save()
        VisitorEvent.objects.create(visitor_session=session, camera=camera, event_type="exit", occurred_at=now, image_path=session.exit_image_path)
        logger.info("Visitor %s exited after %.2f minutes", session.visitor_id, duration)
        return session

    def purge_expired_biometrics(self) -> int:
        """24 soatdan keyin rasm va yuz vektorini qaytarib bo'lmas qilib o'chiradi."""
        try:
            setting, _ = VisitorRetentionSetting.objects.get_or_create(
                pk=1, defaults={"retention_hours": self.retention_hours}
            )
            self.retention_hours = int(setting.retention_hours)
        except Exception:
            # Migrate jarayonida jadval vaqtincha hali bo'lmasligi mumkin.
            pass
        cutoff = timezone.now() - timedelta(hours=self.retention_hours)
        protected_ids = PotentialEmployee.objects.filter(status="pending").values_list("visitor_session_id", flat=True)
        sessions = VisitorSession.objects.filter(
            entered_at__lt=cutoff, biometric_purged_at__isnull=True, is_employee=False,
            employee__isnull=True, status="completed",
        ).exclude(pk__in=protected_ids).only("id", "entry_image_path", "exit_image_path")
        count = 0
        for session in sessions.iterator():
            for image_path in (session.entry_image_path, session.exit_image_path):
                if image_path:
                    try:
                        default_storage.delete(image_path)
                    except Exception:
                        logger.warning("Could not delete expired visitor snapshot %s", image_path)
            VisitorSession.objects.filter(pk=session.pk).update(
                face_embedding="", entry_image_path="", exit_image_path="",
                biometric_purged_at=timezone.now(), updated_at=timezone.now(),
            )
            count += 1
        return count
