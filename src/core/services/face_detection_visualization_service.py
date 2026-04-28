import cv2
import numpy as np
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, date
from django.utils import timezone

logger = logging.getLogger(__name__)


class FaceDetectionVisualizationService:
    """
    Yuzlarni aniqlash va vizualizatsiya qilish servisi.
    - YuNet+SFace bilan yuzlarni taniydi
    - Sariq to'rtburchaklar chizadi
    - Xodim ismlarini ko'rsatadi (agar bazada bo'lsa)
    - Mijozlarni sanab boradi
    """

    # Ranglar (BGR format)
    YELLOW = (0, 255, 255)  # Sariq rang - barcha yuzlar uchun
    WHITE = (255, 255, 255)  # Oq rang - yozuvlar uchun
    BLACK = (0, 0, 0)  # Qora rang - fon uchun
    GREEN = (0, 200, 0)  # Yashil rang - xodimlar uchun

    def __init__(self, location_id: int):
        self.location_id = location_id

        # Mijozlarni hisoblash uchun
        self._daily_customers: Dict[str, set] = {}  # date_str -> set of signatures
        self._tracked_faces: Dict[str, Dict[str, Any]] = {}  # signature -> face info

        # Face recognition service'ni import qilish
        self._face_service = None
        self._models_loaded = False
        self._try_load_models()

        logger.info(f"FaceDetectionVisualizationService initialized for location {location_id}")

    def _try_load_models(self):
        """Face recognition modellarini yuklashga harakat qilish."""
        try:
            from src.core.services.face_recognition_service import FaceRecognitionService
            self._face_service = FaceRecognitionService()
            self._models_loaded = True
            logger.info("Face recognition models loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load face recognition models: {e}")
            self._models_loaded = False

    def process_frame(
        self,
        frame: np.ndarray,
        location_id: Optional[int] = None,
        timestamp: Optional[datetime] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Kadrni qayta ishlash: yuzlarni aniqlash, taniish va chizish.
        """
        if location_id is None:
            location_id = self.location_id
        if timestamp is None:
            timestamp = timezone.now()

        if frame is None or frame.size == 0:
            return frame, {"error": "Empty frame"}

        # 1. Yuzlarni aniqlash
        faces = self._detect_faces(frame)
        logger.debug(f"Detected {len(faces)} faces in frame")

        # 2. Har bir yuzni taniish va ma'lumotlarni yig'ish
        face_data = []
        for i, face in enumerate(faces):
            bbox = face.get("bbox")
            if bbox is None:
                continue

            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

            # Ensure bbox is within frame bounds
            h, w = frame.shape[:2]
            x1 = max(0, min(x1, w - 1))
            y1 = max(0, min(y1, h - 1))
            x2 = max(0, min(x2, w - 1))
            y2 = max(0, min(y2, h - 1))

            # Crop face region
            crop = frame[y1:y2, x1:x2]

            if crop.size == 0:
                continue

            # Yuzni taniish (agar model yuklangan bo'lsa)
            display_name = None
            is_employee = False

            if self._models_loaded and self._face_service:
                try:
                    identity = self._face_service.recognize_face_sync(
                        crop, location_id, embedding=face.get("embedding")
                    )

                    if identity.get("is_employee"):
                        display_name = identity.get("employee_name", "Xodim")
                        is_employee = True
                        logger.debug(f"Employee recognized: {display_name}")
                except Exception as e:
                    logger.debug(f"Face recognition failed: {e}")

            # Agar xodim topilmasa, mijoz deb belgilash
            if not display_name:
                signature = self._get_face_signature(crop) if self._models_loaded else None
                if signature:
                    display_name = f"Mijoz #{signature[:4]}"
                    self._track_customer(signature, location_id, timestamp)

            face_data.append({
                "bbox": (x1, y1, x2, y2),
                "display_name": display_name,
                "is_employee": is_employee,
            })

        # 3. Kadrda chizish
        annotated_frame = self._draw_face_boxes(frame, face_data)

        # 4. Statistika
        today_str = timestamp.date().isoformat()
        stats = {
            "location_id": location_id,
            "timestamp": timestamp.isoformat(),
            "total_faces": len(face_data),
            "employees_detected": sum(1 for f in face_data if f["is_employee"]),
            "customers_detected": sum(1 for f in face_data if not f["is_employee"]),
            "daily_customers": len(self._daily_customers.get(today_str, set())),
        }

        # 5. Statistika yozuvini kadr ustiga qo'shish
        annotated_frame = self._draw_stats(annotated_frame, stats)

        return annotated_frame, stats

    def _detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Yuzlarni aniqlash (YuNet yoki Haar Cascade)."""
        if self._models_loaded and self._face_service:
            try:
                return self._face_service.detect_faces(frame)
            except Exception as e:
                logger.debug(f"YuNet detection failed: {e}")

        # Fallback: Haar Cascade
        return self._detect_faces_haar(frame)

    def _detect_faces_haar(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Haar Cascade bilan yuzlarni aniqlash."""
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            face_cascade = cv2.CascadeClassifier(cascade_path)

            if face_cascade.empty():
                logger.warning("Haar cascade not loaded")
                return []

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))

            results = []
            for (x, y, w, h) in faces:
                results.append({
                    "bbox": [int(x), int(y), int(x + w), int(y + h)],
                    "confidence": 1.0,
                    "label": "face",
                    "embedding": None,
                })
            return results
        except Exception as e:
            logger.debug(f"Haar detection failed: {e}")
            return []

    def _get_face_signature(self, face_image: np.ndarray) -> Optional[str]:
        """Yuz uchun unikal signature olish."""
        if self._models_loaded and self._face_service:
            try:
                return self._face_service.get_face_signature(face_image)
            except Exception:
                pass
        return None

    def _draw_face_boxes(
        self,
        frame: np.ndarray,
        face_data: List[Dict[str, Any]]
    ) -> np.ndarray:
        """Yuzlar atrofida sariq to'rtburchaklar va ismlarni chizish."""
        annotated = frame.copy()

        for face in face_data:
            x1, y1, x2, y2 = face["bbox"]
            display_name = face["display_name"]
            is_employee = face["is_employee"]

            # Ensure coordinates are valid
            if x2 <= x1 or y2 <= y1:
                continue

            # Rang tanlash: xodimlar uchun yashil, mijozlar uchun sariq
            color = self.GREEN if is_employee else self.YELLOW

            # Sariq/yashil to'rtburchak chizish (2px qalinlikda)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Ismni ko'rsatish (agar mavjud bo'lsa)
            if display_name:
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.6
                thickness = 2

                # Yozuv o'lchamini hisoblash
                (text_width, text_height), baseline = cv2.getTextSize(
                    display_name, font, font_scale, thickness
                )

                # Fon to'rtburchak chizish (qora)
                top_left = (x1, max(0, y1 - text_height - baseline - 5))
                bottom_right = (x1 + text_width, y1)
                cv2.rectangle(
                    annotated,
                    top_left,
                    bottom_right,
                    self.BLACK,
                    cv2.FILLED,
                )

                # Ismni yozish (oq rangda)
                cv2.putText(
                    annotated,
                    display_name,
                    (x1, max(baseline + 2, y1 - baseline - 2)),
                    font,
                    font_scale,
                    self.WHITE,
                    thickness,
                )

        return annotated

    def _draw_stats(
        self,
        frame: np.ndarray,
        stats: Dict[str, Any]
    ) -> np.ndarray:
        """Statistika ma'lumotlarini kadr ustiga qo'shish."""
        annotated = frame.copy()

        # Statistika matnlari
        lines = [
            f"Yuzlar: {stats.get('total_faces', 0)}",
            f"Xodimlar: {stats.get('employees_detected', 0)}",
            f"Mijozlar: {stats.get('customers_detected', 0)}",
            f"Kunlik mijozlar: {stats.get('daily_customers', 0)}",
        ]

        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.5
        thickness = 1
        line_height = 20
        start_y = 25

        for i, line in enumerate(lines):
            y = start_y + i * line_height
            # Fon to'rtburchak
            (text_width, text_height), baseline = cv2.getTextSize(
                line, font, font_scale, thickness
            )
            cv2.rectangle(
                annotated,
                (5, y - text_height - 5),
                (text_width + 10, y + 5),
                (0, 0, 0),
                cv2.FILLED,
            )
            # Matn
            cv2.putText(
                annotated,
                line,
                (10, y),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
            )

        return annotated

    def _track_customer(
        self,
        signature: str,
        location_id: int,
        timestamp: datetime
    ):
        """Mijozni kuzatish va hisoblash."""
        today_str = timestamp.date().isoformat()

        if today_str not in self._daily_customers:
            self._daily_customers[today_str] = set()

        self._daily_customers[today_str].add(signature)

        # Tracked faces ma'lumotlarini yangilash
        if signature not in self._tracked_faces:
            self._tracked_faces[signature] = {
                "first_seen": timestamp,
                "last_seen": timestamp,
                "location_id": location_id,
                "visit_count": 1,
            }
        else:
            self._tracked_faces[signature]["last_seen"] = timestamp
            self._tracked_faces[signature]["visit_count"] += 1

    def get_daily_customers(self, date_str: Optional[str] = None) -> int:
        """Kunlik mijozlar sonini olish."""
        if date_str is None:
            date_str = date.today().isoformat()
        return len(self._daily_customers.get(date_str, set()))

    def get_tracked_faces_summary(self) -> Dict[str, Any]:
        """Kuzatilayotgan yuzlar xulosasi."""
        today_str = date.today().isoformat()
        return {
            "location_id": self.location_id,
            "date": today_str,
            "total_tracked_faces": len(self._tracked_faces),
            "daily_customers": self.get_daily_customers(today_str),
            "tracked_faces": {
                sig: {
                    "first_seen": info["first_seen"].isoformat(),
                    "last_seen": info["last_seen"].isoformat(),
                    "visit_count": info["visit_count"],
                }
                for sig, info in self._tracked_faces.items()
            },
        }

    def reset_daily_count(self):
        """Kunlik hisobni tozalash."""
        self._daily_customers.clear()

    def get_frame_with_detections(
        self,
        frame: np.ndarray,
        location_id: Optional[int] = None,
    ) -> np.ndarray:
        """Faqat kadrni qayta ishlash va chizilgan variantni qaytarish."""
        annotated_frame, _ = self.process_frame(frame, location_id)
        return annotated_frame