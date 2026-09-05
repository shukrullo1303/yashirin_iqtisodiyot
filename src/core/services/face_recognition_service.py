import base64
import hashlib
import logging
import os
import pickle
import threading
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

try:
    import face_recognition as _dlib_face_recognition  # type: ignore
except Exception:  # pragma: no cover
    _dlib_face_recognition = None

try:
    from src.core.utils.encryption import encryption_service
except Exception:
    class _NoopEncryptionService:
        @staticmethod
        def encrypt(value: str) -> str:
            return value

        @staticmethod
        def decrypt(value: str) -> str:
            return value

    encryption_service = _NoopEncryptionService()

from src.core.models.employee import Employee, EmployeeFace
from src.core.models.location import Location

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenCV YuNet + SFace — Windows va Linux da ishlaydi, compile shart emas
# YuNet: yuz aniqlash (detection)
# SFace: yuz encoding (128-dim, cosine similarity)
# ---------------------------------------------------------------------------

YUNET_FILENAME = "face_detection_yunet_2023mar.onnx"
SFACE_FILENAME = "face_recognition_sface_2021dec.onnx"
YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
SFACE_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_recognition_sface/face_recognition_sface_2021dec.onnx"
)

OPENCV_FACE_AVAILABLE = hasattr(cv2, "FaceDetectorYN") and hasattr(cv2, "FaceRecognizerSF")

_models_lock = threading.Lock()
_detect_lock = threading.Lock()   # YuNet setInputSize thread-safe emas
_yunet: Optional[cv2.FaceDetectorYN] = None
_sface: Optional[cv2.FaceRecognizerSF] = None


def _get_models_dir() -> str:
    path = getattr(settings, "OPENCV_MODELS_DIR", os.path.join(os.getcwd(), "models"))
    os.makedirs(path, exist_ok=True)
    return path


def _download_model(filename: str, url: str) -> Optional[str]:
    path = os.path.join(_get_models_dir(), filename)
    if os.path.exists(path):
        return path
    logger.info("OpenCV model yuklanmoqda: %s", filename)
    try:
        urllib.request.urlretrieve(url, path)
        logger.info("Model yuklandi: %s", path)
        return path
    except Exception as exc:
        logger.error("Model yuklanmadi (%s): %s", filename, exc)
        if os.path.exists(path):
            os.remove(path)
        return None


def _get_opencv_models():
    """YuNet + SFace modellarini lazy va thread-safe yuklaydi."""
    global _yunet, _sface
    if _yunet is not None and _sface is not None:
        return _yunet, _sface

    if not OPENCV_FACE_AVAILABLE:
        return None, None

    with _models_lock:
        if _yunet is not None and _sface is not None:
            return _yunet, _sface

        yunet_path = _download_model(YUNET_FILENAME, YUNET_URL)
        sface_path = _download_model(SFACE_FILENAME, SFACE_URL)

        if not yunet_path or not sface_path:
            return None, None

        try:
            _yunet = cv2.FaceDetectorYN.create(yunet_path, "", (640, 640), 0.6, 0.3, 5000)
            _sface = cv2.FaceRecognizerSF.create(sface_path, "")
            logger.info("OpenCV YuNet+SFace modellari yuklandi.")
        except Exception as exc:
            logger.error("OpenCV yuz modellari yuklanmadi: %s", exc, exc_info=True)
            _yunet = None
            _sface = None

    return _yunet, _sface


def _yunet_detect(image: np.ndarray, detector) -> Optional[np.ndarray]:
    """YuNet bilan yuzlarni topadi. Lock ishlatadi chunki setInputSize thread-safe emas."""
    h, w = image.shape[:2]
    with _detect_lock:
        detector.setInputSize((w, h))
        _, faces = detector.detect(image)
    return faces


class FaceRecognitionService:
    """
    Yuzlarni tanish servisi.
    Backend: OpenCV YuNet (detection) + SFace (128-dim encoding)
    Windows va Linux da bir xil ishlaydi, compile talab qilmaydi.
    Fallback: Haar Cascade detection + 32x32 grayscale encoding.
    """

    def __init__(self):
        self.confidence_threshold = getattr(settings, "FACE_RECOGNITION_CONFIDENCE", 0.363)
        # "auto" | "opencv" | "face_recognition"
        self.backend = getattr(settings, "FACE_RECOGNITION_BACKEND", "auto")
        self.cache_prefix = "face_encodings_"
        self.presence_cache_prefix = "face_presence_"
        self.employee_presence_threshold = getattr(
            settings, "EMPLOYEE_PRESENCE_THRESHOLD_SECONDS", 7200
        )
        self.fallback_distance_threshold = 10.0

        cascade_dir = getattr(cv2.data, "haarcascades", "")
        cascade_factory = getattr(cv2, "CascadeClassifier", None)
        self.face_cascade = (
            cascade_factory(f"{cascade_dir}haarcascade_frontalface_default.xml")
            if cascade_dir and cascade_factory is not None
            else None
        )

        detector, recognizer = _get_opencv_models()

        dlib_ok = _dlib_face_recognition is not None
        opencv_ok = detector is not None and recognizer is not None

        if self.backend == "face_recognition" and not dlib_ok:
            logger.warning("FACE_RECOGNITION_BACKEND=face_recognition, lekin modul topilmadi. OpenCV/Fallback ishlatiladi.")
        if self.backend == "opencv" and not opencv_ok:
            logger.warning("FACE_RECOGNITION_BACKEND=opencv, lekin YuNet+SFace yuklanmadi. Fallback ishlatiladi.")

        chosen = self._choose_backend(opencv_ok=opencv_ok, dlib_ok=dlib_ok)
        logger.info("FaceRecognitionService tayyor. Backend: %s", chosen)

    def _choose_backend(self, *, opencv_ok: bool, dlib_ok: bool) -> str:
        if self.backend == "opencv":
            return "opencv" if opencv_ok else "fallback"
        if self.backend == "face_recognition":
            return "face_recognition" if dlib_ok else ("opencv" if opencv_ok else "fallback")
        # auto
        if opencv_ok:
            return "opencv"
        if dlib_ok:
            return "face_recognition"
        return "fallback"

    # ------------------------------------------------------------------
    # Yuz aniqlash (Detection)
    # ------------------------------------------------------------------

    def detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Kadr ichidagi yuzlarni topadi. Agar mumkin bo'lsa embedding ham qaytaradi."""
        if frame is None or frame.size == 0:
            return []

        detector, recognizer = _get_opencv_models()
        dlib_ok = _dlib_face_recognition is not None
        opencv_ok = detector is not None and recognizer is not None
        chosen = self._choose_backend(opencv_ok=opencv_ok, dlib_ok=dlib_ok)

        if chosen == "face_recognition" and _dlib_face_recognition is not None:
            return self._detect_dlib(frame)

        if chosen == "opencv" and detector is not None and recognizer is not None:
            try:
                faces = _yunet_detect(frame, detector)
                if faces is None:
                    return []

                results = []
                for row in faces:
                    x, y, fw, fh = int(row[0]), int(row[1]), int(row[2]), int(row[3])
                    score = float(row[14])
                    if score < 0.5:
                        continue

                    embedding = None
                    try:
                        aligned = recognizer.alignCrop(frame, row)
                        feat = recognizer.feature(aligned)
                        embedding = np.asarray(feat, dtype=np.float32).flatten()
                    except Exception:
                        pass

                    results.append(
                        {
                            "bbox": [max(0, x), max(0, y), max(0, x + fw), max(0, y + fh)],
                            "confidence": score,
                            "label": "face",
                            "embedding": embedding,
                        }
                    )
                return results
            except Exception as exc:
                logger.warning("YuNet detect xatolik: %s", exc)

        # Fallback: Haar Cascade
        return self._detect_haar(frame)

    def _detect_dlib(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """face_recognition (dlib) bilan detection + 128-dim embedding."""
        try:
            fr = _dlib_face_recognition
            if fr is None:
                return []

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # returns (top, right, bottom, left)
            boxes = fr.face_locations(rgb, model="hog")
            if not boxes:
                return []

            encs = fr.face_encodings(rgb, known_face_locations=boxes)
            results: List[Dict[str, Any]] = []
            for (top, right, bottom, left), enc in zip(boxes, encs):
                x1, y1, x2, y2 = int(left), int(top), int(right), int(bottom)
                results.append(
                    {
                        "bbox": [max(0, x1), max(0, y1), max(0, x2), max(0, y2)],
                        "confidence": 1.0,
                        "label": "face",
                        "embedding": np.asarray(enc, dtype=np.float32).flatten(),
                    }
                )
            return results
        except Exception as exc:
            logger.warning("face_recognition detect xatolik: %s", exc)
            return []

    def _detect_haar(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.face_cascade is None or self.face_cascade.empty():
            return []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        dets = self.face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))
        return [
            {
                "bbox": [int(x), int(y), int(x + w), int(y + h)],
                "confidence": 1.0,
                "label": "face",
                "embedding": None,
            }
            for (x, y, w, h) in dets
        ]

    # ------------------------------------------------------------------
    # Yuz encoding
    # ------------------------------------------------------------------

    def _encode_face(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """Yuz rasmini 128-dim SFace embedding yoki 1024-dim grayscale fallback ga o'tkazadi."""
        if face_image is None or face_image.size == 0:
            return None

        try:
            detector, recognizer = _get_opencv_models()
            dlib_ok = _dlib_face_recognition is not None
            opencv_ok = detector is not None and recognizer is not None
            chosen = self._choose_backend(opencv_ok=opencv_ok, dlib_ok=dlib_ok)

            if chosen == "face_recognition" and _dlib_face_recognition is not None:
                rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
                encs = _dlib_face_recognition.face_encodings(rgb)
                if encs:
                    return np.asarray(encs[0], dtype=np.float32).flatten()

            if detector is not None and recognizer is not None:
                faces = _yunet_detect(face_image, detector)
                if faces is not None and len(faces) > 0:
                    best = max(faces, key=lambda r: r[14])
                    aligned = recognizer.alignCrop(face_image, best)
                    feat = recognizer.feature(aligned)
                    return np.asarray(feat, dtype=np.float32).flatten()

            # Fallback: 32x32 grayscale flatten (1024-dim)
            gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
            resized = cv2.resize(gray, (32, 32)).astype("float32") / 255.0
            return resized.flatten()

        except Exception as exc:
            logger.error("Encoding xatolik: %s", exc, exc_info=True)
            return None

    def _largest_face_crop(self, image_bgr: np.ndarray) -> Optional[np.ndarray]:
        """To'liq kadrdan eng katta yuzni kesib oladi."""
        if image_bgr is None or image_bgr.size == 0:
            return None
        try:
            detector, _ = _get_opencv_models()
            if detector is not None:
                faces = _yunet_detect(image_bgr, detector)
                if faces is not None and len(faces) > 0:
                    best = max(faces, key=lambda r: r[2] * r[3])
                    x, y, fw, fh = int(best[0]), int(best[1]), int(best[2]), int(best[3])
                    return image_bgr[max(0, y): y + fh, max(0, x): x + fw]

            # Haar fallback
            if self.face_cascade and not self.face_cascade.empty():
                gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
                dets = self.face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))
                if len(dets):
                    x, y, w, h = max(dets, key=lambda r: r[2] * r[3])
                    return image_bgr[y: y + h, x: x + w]
        except Exception as exc:
            logger.warning("Face crop xatolik: %s", exc)
        return None

    # ------------------------------------------------------------------
    # Yuzni tanish (Recognition)
    # ------------------------------------------------------------------

    async def recognize_face(
        self,
        face_image: np.ndarray,
        location_id: int,
        embedding: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        return self.recognize_face_sync(face_image, location_id, embedding=embedding)

    def recognize_face_sync(
        self,
        face_image: np.ndarray,
        location_id: int,
        embedding: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        """Yuzni tanib xodimni aniqlaydi. Agar embedding berilsa qayta hisoblash kerak emas."""
        try:
            if embedding is not None:
                face_encoding = np.asarray(embedding, dtype=np.float32).flatten()
            else:
                face_encoding = self._encode_face(face_image)

            if face_encoding is None:
                return {"is_employee": False, "confidence": 0.0}

            match = self._find_match(face_encoding, location_id)
            if match:
                return {
                    "is_employee": True,
                    "employee_id": match["employee_id"],
                    "employee_name": match["employee_name"],
                    "confidence": match["confidence"],
                }

            return {"is_employee": False, "confidence": 0.0, "is_unregistered": True}
        except Exception as exc:
            logger.error("Face recognition xatolik: %s", exc, exc_info=True)
            return {"is_employee": False, "error": str(exc)}

    def _find_match(
        self, face_encoding: np.ndarray, location_id: int
    ) -> Optional[Dict[str, Any]]:
        """Bazadagi xodim yuzlari bilan solishtiradi."""
        cache_key = f"{self.cache_prefix}{location_id}"
        encodings_data = cache.get(cache_key)
        if not encodings_data:
            encodings_data = self._load_encodings_to_cache(location_id)

        if not encodings_data:
            return None

        target = np.asarray(face_encoding, dtype=np.float32).flatten()

        comparable = []
        for item in encodings_data:
            known = np.asarray(item["encoding"], dtype=np.float32).flatten()
            if known.shape == target.shape:
                comparable.append({**item, "encoding": known})

        if not comparable:
            return None

        is_sface = len(target) == 128

        if is_sface:
            # Cosine similarity uchun normalize qilamiz
            t_norm = target / (np.linalg.norm(target) + 1e-8)
            sims = np.array(
                [
                    float(
                        np.dot(
                            item["encoding"] / (np.linalg.norm(item["encoding"]) + 1e-8),
                            t_norm,
                        )
                    )
                    for item in comparable
                ]
            )
            best_idx = int(np.argmax(sims))
            confidence = float(max(0.0, sims[best_idx]))
            matched = confidence >= self.confidence_threshold
        else:
            # L2 distance fallback (grayscale 32x32)
            distances = np.array(
                [float(np.linalg.norm(item["encoding"] - target)) for item in comparable]
            )
            best_idx = int(np.argmin(distances))
            best_dist = float(distances[best_idx])
            confidence = max(0.0, 1.0 - (best_dist / self.fallback_distance_threshold))
            matched = best_dist <= self.fallback_distance_threshold and confidence >= 0.35

        if not matched:
            return None

        match_data = comparable[best_idx]
        return {
            "employee_id": match_data["employee_id"],
            "employee_name": match_data["employee_name"],
            "confidence": float(round(confidence, 3)),
        }

    def _load_encodings_to_cache(self, location_id: int) -> List[Dict[str, Any]]:
        """EmployeeFace yozuvlarini keshga yuklaydi."""
        faces = EmployeeFace.objects.filter(
            employee__location_id=location_id,
            employee__is_active=True,
        ).select_related("employee")

        encodings_data: List[Dict[str, Any]] = []
        for face in faces:
            try:
                decrypted = encryption_service.decrypt(face.face_encoding)
                raw = decrypted or face.face_encoding
                encoding = pickle.loads(base64.b64decode(raw))
                encodings_data.append(
                    {
                        "employee_id": face.employee.id,
                        "employee_name": face.employee.full_name,
                        "encoding": np.asarray(encoding, dtype=np.float32),
                    }
                )
            except Exception as exc:
                logger.warning(
                    "Face encoding o'tkazib yuborildi (xodim %s): %s",
                    face.employee_id,
                    exc,
                )

        cache.set(f"{self.cache_prefix}{location_id}", encodings_data, 3600)
        return encodings_data

    def _serialize_encoding(self, encoding: np.ndarray) -> str:
        pickled = base64.b64encode(pickle.dumps(encoding)).decode()
        return encryption_service.encrypt(pickled)

    def _link_employee_to_recent_visitor_sessions(self, employee: Employee, encoding: np.ndarray) -> int:
        """Qo'lda yaratilgan xodimni shu joydagi yangi kamera tashrifiga bog'laydi.

        Xodim rasm bilan qo'shilgan bo'lsa, oldingi mijoz yozuvi alohida qolib
        ketmasin. Faqat oxirgi retention oralig'idagi, yetarlicha o'xshash
        tashriflar biriktiriladi.
        """
        from datetime import timedelta
        from src.core.models.customer import VisitorSession

        target = np.asarray(encoding, dtype=np.float32).flatten()
        cutoff = timezone.now() - timedelta(
            hours=int(getattr(settings, "VISITOR_BIOMETRIC_RETENTION_HOURS", 24))
        )
        linked = 0
        sessions = VisitorSession.objects.filter(
            location_id=employee.location_id, entered_at__gte=cutoff
        ).exclude(face_embedding="")
        threshold = float(getattr(settings, "VISITOR_FACE_MATCH_THRESHOLD", 0.40))
        for session in sessions.iterator():
            try:
                raw = encryption_service.decrypt(session.face_embedding) or session.face_embedding
                known = np.asarray(pickle.loads(base64.b64decode(raw)), dtype=np.float32).flatten()
            except Exception:
                continue
            if known.shape != target.shape:
                continue
            if len(target) == 128:
                score = float(np.dot(known, target) / ((np.linalg.norm(known) * np.linalg.norm(target)) + 1e-8))
            else:
                score = max(0.0, 1.0 - float(np.linalg.norm(known - target)) / self.fallback_distance_threshold)
            if score < threshold:
                continue
            VisitorSession.objects.filter(pk=session.pk).update(is_employee=True, employee=employee)
            if not employee.monitoring_id:
                employee.monitoring_id = session.visitor_id
                employee.save(update_fields=["monitoring_id", "updated_at"])
            linked += 1
        return linked

    def reconcile_recent_employee_visitors(self) -> int:
        """Oldin qo'lda qo'shilgan xodimlarni ham ochiq kamera yozuvlariga bog'laydi."""
        linked = 0
        for employee in Employee.objects.filter(is_active=True).exclude(face_embedding__isnull=True).exclude(face_embedding=""):
            try:
                raw = encryption_service.decrypt(employee.face_embedding) or employee.face_embedding
                encoding = np.asarray(pickle.loads(base64.b64decode(raw)), dtype=np.float32).flatten()
            except Exception:
                continue
            linked += self._link_employee_to_recent_visitor_sessions(employee, encoding)
        return linked

    def get_face_signature(self, face_image: np.ndarray) -> Optional[str]:
        encoding = self._encode_face(face_image)
        if encoding is None:
            return None
        digest = hashlib.sha1(np.asarray(encoding, dtype=np.float32).tobytes()).hexdigest()
        return digest[:16]

    # ------------------------------------------------------------------
    # Yuz mavjudligi (Presence tracking)
    # ------------------------------------------------------------------

    def update_face_presence(
        self,
        signature: str,
        location_id: int,
        timestamp: Optional[datetime] = None,
    ) -> Optional[Dict[str, Any]]:
        if not signature:
            return None

        if timestamp is None:
            timestamp = timezone.now()

        date_key = timestamp.date().isoformat()
        cache_key = f"{self.presence_cache_prefix}{location_id}_{signature}"
        presence = cache.get(cache_key) or {}

        if presence.get("date") != date_key:
            presence = {
                "signature": signature,
                "location_id": location_id,
                "date": date_key,
                "first_seen": timestamp.isoformat(),
                "last_seen": timestamp.isoformat(),
                "total_seconds": 0,
                "is_employee": False,
                "role": "unknown",
            }
        else:
            last_seen = datetime.fromisoformat(presence.get("last_seen"))
            delta = (timestamp - last_seen).total_seconds()
            if 0 < delta <= 1800:
                presence["total_seconds"] = int(
                    presence.get("total_seconds", 0) + min(delta, 300)
                )
            presence["last_seen"] = timestamp.isoformat()

        total_secs = presence.get("total_seconds", 0)
        if total_secs >= self.employee_presence_threshold:
            presence["is_employee"] = True
            presence["role"] = "potential_employee"
        elif total_secs > 0:
            presence["role"] = "customer"
            presence["is_employee"] = False
        else:
            presence["role"] = "unknown"
            presence["is_employee"] = False

        cache.set(cache_key, presence, 60 * 60 * 24)
        return presence

    def get_face_presence(self, signature: str, location_id: int) -> Optional[Dict[str, Any]]:
        if not signature:
            return None
        return cache.get(f"{self.presence_cache_prefix}{location_id}_{signature}")

    # ------------------------------------------------------------------
    # Rasm saqlash
    # ------------------------------------------------------------------

    def _save_face_image(
        self, face_image: np.ndarray, signature: str, location_id: int
    ) -> Optional[str]:
        if face_image is None or face_image.size == 0 or not signature:
            return None
        try:
            base_dir = getattr(settings, "FACE_SNAPSHOT_DIR", "face_snapshots")
            media_root = getattr(
                settings, "MEDIA_ROOT", os.path.join(os.getcwd(), "media")
            )
            date_folder = timezone.now().strftime("%Y%m%d")
            target_dir = os.path.join(media_root, base_dir, str(location_id), date_folder)
            os.makedirs(target_dir, exist_ok=True)

            filename = f"{signature}_{timezone.now().strftime('%H%M%S')}.jpg"
            filepath = os.path.join(target_dir, filename)
            cv2.imwrite(filepath, face_image)

            return os.path.relpath(filepath, media_root).replace("\\", "/")
        except Exception as exc:
            logger.error("Face rasm saqlashda xatolik: %s", exc, exc_info=True)
            return None

    # ------------------------------------------------------------------
    # Xodim yuzini qo'shish
    # ------------------------------------------------------------------

    @transaction.atomic
    def add_employee_face(self, employee_id: int, image_bytes: bytes) -> Dict[str, Any]:
        """Yangi xodim yuzi encoding'ini saqlaydi."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            crop = self._largest_face_crop(image)
            face_input = crop if crop is not None and crop.size else image
            encoding = self._encode_face(face_input)
            if encoding is None:
                return {"success": False, "error": "Yuz aniqlanmadi"}

            serialized = self._serialize_encoding(encoding)
            employee = Employee.objects.get(id=employee_id)
            face_record = EmployeeFace.objects.create(
                employee_id=employee_id,
                face_encoding=serialized,
                image_path=self._save_face_image(
                    face_input,
                    self.get_face_signature(face_input) or "",
                    employee.location_id,
                ),
            )
            employee.face_embedding = serialized
            employee.save(update_fields=["face_embedding", "status"])

            cache.delete(f"{self.cache_prefix}{employee.location_id}")
            linked = self._link_employee_to_recent_visitor_sessions(employee, encoding)
            return {"success": True, "face_id": face_record.id, "linked_visitors": linked}
        except Exception as exc:
            logger.error("Yuz qo'shishda xatolik: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}

    @transaction.atomic
    def track_frequent_face(
        self, face_image: np.ndarray, location_id: int, min_count: int = 3
    ) -> Dict[str, Any]:
        """Ko'p ko'ringan noma'lum yuzni draft xodim sifatida ro'yxatga oladi."""
        encoding = self._encode_face(face_image)
        if encoding is None:
            return {"seen_count": 0, "employee_id": None}

        signature = self.get_face_signature(face_image)
        if not signature:
            return {"seen_count": 0, "employee_id": None}

        counter_key = f"unknown_face_count_{location_id}_{signature}"
        seen_count = int(cache.get(counter_key, 0)) + 1
        cache.set(counter_key, seen_count, 60 * 60 * 24)

        if seen_count < min_count:
            return {"signature": signature, "seen_count": seen_count, "employee_id": None}

        passport_marker = f"AUTO-{signature[:12].upper()}"
        location = Location.objects.filter(id=location_id).first()
        position_label = "AI tomonidan topilgan"
        if location:
            loc_type = location.get_location_type_display() if location.location_type else ""
            position_label = f"{location.name} {loc_type} xodimi".strip()

        employee, created = Employee.objects.get_or_create(
            location_id=location_id,
            passport_number=passport_marker,
            defaults={
                "full_name": f"Auto detected employee {signature[:6].upper()}",
                "position": position_label,
                "is_registered": False,
                "is_verified": False,
                "status": "candidate_by_ai",
                "is_active": True,
            },
        )
        if not created and employee.status != "candidate_by_ai":
            employee.status = "candidate_by_ai"
            employee.save(update_fields=["status"])

        image_path = self._save_face_image(face_image, signature, location_id)

        if not employee.faces.exists():
            EmployeeFace.objects.create(
                employee=employee,
                face_encoding=self._serialize_encoding(np.asarray(encoding, dtype=np.float32)),
                image_path=image_path,
                confidence=float(min(0.99, 0.5 + (seen_count * 0.1))),
            )
            cache.delete(f"{self.cache_prefix}{location_id}")

        return {
            "signature": signature,
            "seen_count": seen_count,
            "employee_id": employee.id,
            "employee_name": employee.full_name,
            "auto_registered": created,
            "is_registered": employee.is_registered,
            "image_path": image_path,
            "position": employee.position,
        }

    @transaction.atomic
    def ensure_draft_employee_for_presence(
        self,
        face_image: np.ndarray,
        signature: str,
        location_id: int,
        presence: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Kamera oldida uzoq turgan yuz uchun draft xodim yaratadi."""
        if not signature or not presence or presence.get("role") != "potential_employee":
            return {"employee_id": None}

        encoding = self._encode_face(face_image)
        if encoding is None:
            return {"employee_id": None}

        passport_marker = f"AUTO-{signature[:12].upper()}"
        location = Location.objects.filter(id=location_id).first()
        position_label = "AI tomonidan topilgan"
        if location:
            loc_type = location.get_location_type_display() if location.location_type else ""
            position_label = f"{location.name} {loc_type} xodimi".strip()

        employee, created = Employee.objects.get_or_create(
            location_id=location_id,
            passport_number=passport_marker,
            defaults={
                "full_name": f"Auto detected employee {signature[:6].upper()}",
                "position": position_label,
                "is_registered": False,
                "is_verified": False,
                "status": "candidate_by_ai",
                "is_active": True,
            },
        )
        if not created and employee.status != "candidate_by_ai":
            employee.status = "candidate_by_ai"
            employee.save(update_fields=["status"])

        image_path = self._save_face_image(face_image, signature, location_id)

        if not employee.faces.exists():
            EmployeeFace.objects.create(
                employee=employee,
                face_encoding=self._serialize_encoding(
                    np.asarray(encoding, dtype=np.float32)
                ),
                image_path=image_path,
                confidence=float(
                    min(
                        0.99,
                        0.5
                        + (
                            presence.get("total_seconds", 0)
                            / max(1, self.employee_presence_threshold)
                        )
                        * 0.4,
                    )
                ),
            )
            cache.delete(f"{self.cache_prefix}{location_id}")
            employee.face_embedding = self._serialize_encoding(
                np.asarray(encoding, dtype=np.float32)
            )
            employee.save(update_fields=["face_embedding"])

        return {
            "signature": signature,
            "employee_id": employee.id,
            "employee_name": employee.full_name,
            "auto_registered": created,
            "is_registered": employee.is_registered,
            "image_path": image_path,
            "position": employee.position,
        }
