import base64
import hashlib
import logging
import pickle
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache
from django.db import transaction

try:
    import face_recognition
except ImportError:  # pragma: no cover - optional dependency
    face_recognition = None

try:
    from src.core.utils.encryption import encryption_service
except Exception:  # pragma: no cover - fallback when helper is absent
    class _NoopEncryptionService:
        @staticmethod
        def encrypt(value: str) -> str:
            return value

        @staticmethod
        def decrypt(value: str) -> str:
            return value

    encryption_service = _NoopEncryptionService()

from src.core.models.employee import Employee, EmployeeFace

logger = logging.getLogger(__name__)


class FaceRecognitionService:
    """Yuzlarni tanish va ko‘p ko‘ringan nomalum yuzlarni xodim sifatida draft qilish servisi."""

    def __init__(self):
        self.confidence_threshold = getattr(settings, "FACE_RECOGNITION_CONFIDENCE", 0.6)
        self.cache_prefix = "face_encodings_"
        self.fallback_distance_threshold = 10.0
        cascade_dir = getattr(cv2.data, "haarcascades", "")
        self.face_cascade = cv2.CascadeClassifier(f"{cascade_dir}haarcascade_frontalface_default.xml") if cascade_dir else None
        logger.info("FaceRecognitionService loaded (native=%s)", face_recognition is not None)

    def detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Kadr ichidagi yuzlarni topadi."""
        if (
            frame is None
            or frame.size == 0
            or self.face_cascade is None
            or self.face_cascade.empty()
        ):
            return []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        detections = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(40, 40),
        )

        return [
            {
                "bbox": [int(x), int(y), int(x + w), int(y + h)],
                "confidence": 1.0,
                "label": "face",
            }
            for (x, y, w, h) in detections
        ]

    async def recognize_face(self, face_image: np.ndarray, location_id: int) -> Dict[str, Any]:
        return self.recognize_face_sync(face_image, location_id)

    def recognize_face_sync(self, face_image: np.ndarray, location_id: int) -> Dict[str, Any]:
        """Yuzni tanish va hodimni aniqlash."""
        try:
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
            logger.error("Face recognition error: %s", exc, exc_info=True)
            return {"is_employee": False, "error": str(exc)}

    def _encode_face(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """Yuz rasmini encoding ko‘rinishiga o‘tkazadi."""
        try:
            if face_image is None or face_image.size == 0:
                return None

            rgb_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            if face_recognition is not None:
                encodings = face_recognition.face_encodings(rgb_image)
                if encodings:
                    return np.asarray(encodings[0], dtype=np.float32)

            gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
            resized = cv2.resize(gray, (32, 32)).astype("float32") / 255.0
            return resized.flatten()
        except Exception as exc:
            logger.error("Encoding error: %s", exc, exc_info=True)
            return None

    def _find_match(self, face_encoding: np.ndarray, location_id: int) -> Optional[Dict[str, Any]]:
        """Bazadagi employee face'lar bilan taqqoslaydi."""
        cache_key = f"{self.cache_prefix}{location_id}"
        encodings_data = cache.get(cache_key)

        if not encodings_data:
            encodings_data = self._load_encodings_to_cache(location_id)

        if not encodings_data:
            return None

        target = np.asarray(face_encoding, dtype=np.float32).reshape(-1)
        comparable = []
        for item in encodings_data:
            known = np.asarray(item["encoding"], dtype=np.float32).reshape(-1)
            if known.shape == target.shape:
                comparable.append({**item, "encoding": known})

        if not comparable:
            return None

        distances = np.array([
            float(np.linalg.norm(item["encoding"] - target))
            for item in comparable
        ])
        best_match_index = int(np.argmin(distances))
        best_distance = float(distances[best_match_index])

        if face_recognition is not None:
            confidence = max(0.0, 1.0 - best_distance)
            matched = confidence >= self.confidence_threshold
        else:
            confidence = max(0.0, 1.0 - (best_distance / self.fallback_distance_threshold))
            matched = best_distance <= self.fallback_distance_threshold and confidence >= 0.35

        if not matched:
            return None

        match_data = comparable[best_match_index]
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
                decrypted_data = encryption_service.decrypt(face.face_encoding)
                raw_value = decrypted_data or face.face_encoding
                encoding = pickle.loads(base64.b64decode(raw_value))
                encodings_data.append(
                    {
                        "employee_id": face.employee.id,
                        "employee_name": face.employee.full_name,
                        "encoding": np.asarray(encoding, dtype=np.float32),
                    }
                )
            except Exception as exc:
                logger.warning("Face encoding skipped for employee %s: %s", face.employee_id, exc)

        cache.set(f"{self.cache_prefix}{location_id}", encodings_data, 3600)
        return encodings_data

    def _serialize_encoding(self, encoding: np.ndarray) -> str:
        pickled_encoding = base64.b64encode(pickle.dumps(encoding)).decode()
        return encryption_service.encrypt(pickled_encoding)

    def get_face_signature(self, face_image: np.ndarray) -> Optional[str]:
        encoding = self._encode_face(face_image)
        if encoding is None:
            return None
        digest = hashlib.sha1(np.asarray(encoding, dtype=np.float32).tobytes()).hexdigest()
        return digest[:16]

    @transaction.atomic
    def add_employee_face(self, employee_id: int, image_bytes: bytes) -> Dict[str, Any]:
        """Yangi hodim yuzi encoding'ini saqlaydi."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            encoding = self._encode_face(image)
            if encoding is None:
                return {"success": False, "error": "Yuz aniqlanmadi"}

            face_record = EmployeeFace.objects.create(
                employee_id=employee_id,
                face_encoding=self._serialize_encoding(encoding),
            )

            employee = Employee.objects.get(id=employee_id)
            cache.delete(f"{self.cache_prefix}{employee.location_id}")
            return {"success": True, "face_id": face_record.id}
        except Exception as exc:
            logger.error("Add face error: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}

    @transaction.atomic
    def track_frequent_face(self, face_image: np.ndarray, location_id: int, min_count: int = 3) -> Dict[str, Any]:
        """Ko‘p ko‘ringan nomalum yuzni draft employee sifatida ro‘yxatga oladi."""
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
        employee, created = Employee.objects.get_or_create(
            location_id=location_id,
            passport_number=passport_marker,
            defaults={
                "full_name": f"Auto detected employee {signature[:6].upper()}",
                "position": "AI tomonidan topilgan",
                "is_registered": False,
                "is_active": True,
            },
        )

        if not employee.faces.exists():
            EmployeeFace.objects.create(
                employee=employee,
                face_encoding=self._serialize_encoding(np.asarray(encoding, dtype=np.float32)),
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
        }