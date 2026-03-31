import face_recognition
import numpy as np
import cv2
import pickle
import base64
import logging
from typing import List, Dict, Any, Optional
from django.conf import settings
from django.db import transaction
from django.core.cache import cache

# Лойиҳа ички моделлари ва хизматлари
from src.core.models.employee import Employee, EmployeeFace
from src.core.utils.encryption import encryption_service 

logger = logging.getLogger(__name__)

class FaceRecognitionService:
    """Фейс-идентификация сервиси (Django версия)"""
    
    def __init__(self):
        self.confidence_threshold = getattr(settings, 'FACE_RECOGNITION_CONFIDENCE', 0.6)
        # Кеш учун локация ID ишлатилади
        self.cache_prefix = "face_encodings_"
        logger.info("Face Recognition сервис (Django) ишга тушди")

    async def recognize_face(self, face_image: np.ndarray, location_id: int) -> Dict[str, Any]:
        """Юзни таниш ва ходимни аниқлаш"""
        try:
            # 1. Юзни 128 ўлчамли вектор (encoding) кўринишига ўтказиш
            face_encoding = self._encode_face(face_image)
            if face_encoding is None:
                return {"is_employee": False, "confidence": 0.0}

            # 2. Мос келувчи ходимни қидириш
            match = await self._find_match(face_encoding, location_id)
            
            if match:
                return {
                    "is_employee": True,
                    "employee_id": match["employee_id"],
                    "employee_name": match["employee_name"],
                    "confidence": match["confidence"]
                }
            
            return {"is_employee": False, "confidence": 0.0, "is_unregistered": True}

        except Exception as e:
            logger.error(f"Face Recognition Error: {e}", exc_info=True)
            return {"is_employee": False, "error": str(e)}

    def _encode_face(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """Расмдан юз хусусиятларини ажратиб олиш"""
        try:
            # OpenCV BGR ишлатади, face_recognition эса RGB
            rgb_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            encodings = face_recognition.face_encodings(rgb_image)
            
            return encodings[0] if encodings else None
        except Exception as e:
            logger.error(f"Encoding Error: {e}")
            return None

    async def _find_match(self, face_encoding: np.ndarray, location_id: int) -> Optional[Dict[str, Any]]:
        """Базадаги ходимлар билан солиштириш"""
        # Кешдан маълумотларни олиш (Django Cache Framework)
        cache_key = f"{self.cache_prefix}{location_id}"
        encodings_data = cache.get(cache_key)

        if not encodings_data:
            encodings_data = await self._load_encodings_to_cache(location_id)

        if not encodings_data:
            return None

        # Солиштириш учун барча encoding'ларни массивга йиғиш
        known_encodings = [d['encoding'] for d in encodings_data]
        
        # Масофани ҳисоблаш (Face Distance)
        distances = face_recognition.face_distance(known_encodings, face_encoding)
        best_match_index = np.argmin(distances)
        
        if distances[best_match_index] < self.confidence_threshold:
            match_data = encodings_data[best_match_index]
            # Ишончлилик даражасини фоизда ҳисоблаш
            confidence = 1.0 - distances[best_match_index]
            
            return {
                "employee_id": match_data["employee_id"],
                "employee_name": match_data["employee_name"],
                "confidence": float(confidence)
            }
        
        return None

    async def _load_encodings_to_cache(self, location_id: int) -> List[Dict]:
        """Базадан шифрланган юзларни юклаш ва дешифрлаш"""
        # Фақат шу локациядаги фаол ходимлар
        faces = EmployeeFace.objects.filter(
            employee__location_id=location_id,
            employee__is_active=True
        ).select_related('employee')

        encodings_data = []
        for face in faces:
            # Шифрланган маълумотни очиш
            decrypted_data = encryption_service.decrypt(face.face_encoding)
            encoding = pickle.loads(base64.b64decode(decrypted_data))
            
            encodings_data.append({
                "employee_id": face.employee.id,
                "employee_name": face.employee.full_name,
                "encoding": encoding
            })
        
        # 1 соатга кешга сақлаш
        cache.set(f"{self.cache_prefix}{location_id}", encodings_data, 3600)
        return encodings_data

    @transaction.atomic
    def add_employee_face(self, employee_id: int, image_bytes: bytes) -> Dict[str, Any]:
        """Янги ходим юзини рўйхатга олиш"""
        try:
            # Расмни ўқиш
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            encoding = self._encode_face(image)
            if encoding is None:
                return {"success": False, "error": "Юз аниқланмади"}

            # Encoding'ни сақлаш учун тайёрлаш (Pickle + Base64 + Encryption)
            pickled_encoding = base64.b64encode(pickle.dumps(encoding)).decode()
            encrypted_encoding = encryption_service.encrypt(pickled_encoding)

            # Базага ёзиш
            face_record = EmployeeFace.objects.create(
                employee_id=employee_id,
                face_encoding=encrypted_encoding
            )

            # Кешни тозалаш (кейинги сафар янги маълумот юкланиши учун)
            employee = Employee.objects.get(id=employee_id)
            cache.delete(f"{self.cache_prefix}{employee.location_id}")

            return {"success": True, "face_id": face_record.id}

        except Exception as e:
            logger.error(f"Add Face Error: {e}")
            return {"success": False, "error": str(e)}