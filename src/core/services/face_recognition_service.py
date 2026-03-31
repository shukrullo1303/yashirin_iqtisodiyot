"""
Фейс-идентификация сервиси
Face Recognition модули
"""
import face_recognition
import numpy as np
import cv2
import pickle
import base64
from typing import List, Dict, Any, Optional
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.encryption import encryption_service
from app.models.employee import Employee, EmployeeFace
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


class FaceRecognitionService:
    """Фейс-идентификация сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.confidence_threshold = settings.FACE_RECOGNITION_CONFIDENCE
        self.face_cache = {}  # Кеш: location_id -> encodings
        logger.info("Face Recognition сервис инициализация қилинди")
    
    async def recognize_face(
        self,
        face_image: np.ndarray,
        location_id: int
    ) -> Dict[str, Any]:
        """
        Юзни таниш
        """
        try:
            # Юзни кодирлаш
            face_encoding = self._encode_face(face_image)
            if face_encoding is None:
                return {
                    "is_employee": False,
                    "confidence": 0.0
                }
            
            # Базадан топиш
            match = await self._find_match(face_encoding, location_id)
            
            if match:
                return {
                    "is_employee": True,
                    "employee_id": match["employee_id"],
                    "employee_name": match["employee_name"],
                    "is_registered": match["is_registered"],
                    "confidence": match["confidence"]
                }
            else:
                return {
                    "is_employee": False,
                    "confidence": 0.0,
                    "is_unregistered": True  # Номаълум юз
                }
        
        except Exception as e:
            logger.error(f"Юзни танишда хатолик: {e}", exc_info=True)
            return {
                "is_employee": False,
                "confidence": 0.0,
                "error": str(e)
            }
    
    def _encode_face(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """Юзни кодирлаш"""
        try:
            # RGBга айлантириш
            if len(face_image.shape) == 3 and face_image.shape[2] == 3:
                rgb_image = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
            else:
                rgb_image = face_image
            
            # Face recognition кодирлаш
            encodings = face_recognition.face_encodings(rgb_image)
            
            if len(encodings) > 0:
                return encodings[0]
            else:
                return None
        
        except Exception as e:
            logger.error(f"Юзни кодирлашда хатолик: {e}")
            return None
    
    async def _find_match(
        self,
        face_encoding: np.ndarray,
        location_id: int
    ) -> Optional[Dict[str, Any]]:
        """Базадан мос келувчини топиш"""
        db = SessionLocal()
        try:
            # Кешдан олиш ёки базадан юклаш
            if location_id not in self.face_cache:
                await self._load_face_encodings(location_id, db)
            
            encodings_data = self.face_cache.get(location_id, [])
            
            if not encodings_data:
                return None
            
            # Мос келувчини топиш
            best_match = None
            best_distance = float('inf')
            
            for encoding_data in encodings_data:
                stored_encoding = self._decode_encoding(encoding_data["encoding"])
                distance = face_recognition.face_distance(
                    [stored_encoding],
                    face_encoding
                )[0]
                
                if distance < best_distance:
                    best_distance = distance
                    best_match = encoding_data
            
            # Confidence ҳисоблаш
            if best_match and best_distance < 0.6:  # Threshold
                confidence = 1.0 - (best_distance / 0.6)
                return {
                    "employee_id": best_match["employee_id"],
                    "employee_name": best_match["employee_name"],
                    "is_registered": best_match["is_registered"],
                    "confidence": confidence
                }
            
            return None
        
        finally:
            db.close()
    
    async def _load_face_encodings(self, location_id: int, db: Session):
        """Базадан юз кодирларини юклаш"""
        try:
            employees = db.query(Employee).filter(
                Employee.location_id == location_id,
                Employee.is_active == True
            ).all()
            
            encodings_data = []
            
            for employee in employees:
                faces = db.query(EmployeeFace).filter(
                    EmployeeFace.employee_id == employee.id
                ).all()
                
                for face in faces:
                    encoding = self._decode_encoding(face.face_encoding)
                    encodings_data.append({
                        "employee_id": employee.id,
                        "employee_name": employee.full_name,
                        "is_registered": employee.is_registered,
                        "encoding": encoding
                    })
            
            self.face_cache[location_id] = encodings_data
            logger.info(f"Локация {location_id} учун {len(encodings_data)} та юз кодири юкланди")
        
        except Exception as e:
            logger.error(f"Юз кодирларини юклашда хатолик: {e}")
            self.face_cache[location_id] = []
    
    def _decode_encoding(self, encrypted_encoding: str) -> np.ndarray:
        """Шифрланган кодирни дешифрлаш"""
        try:
            decrypted = encryption_service.decrypt(encrypted_encoding)
            encoding = pickle.loads(base64.b64decode(decrypted))
            return np.array(encoding)
        except Exception as e:
            logger.error(f"Кодирни дешифрлашда хатолик: {e}")
            return np.array([])
    
    async def add_employee_face(
        self,
        employee_id: int,
        image_base64: str
    ) -> Dict[str, Any]:
        """
        Ходим юзини базага қўшиш
        """
        db = SessionLocal()
        try:
            # Расмни декодирлаш
            image_data = base64.b64decode(image_base64)
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Расмни декодирлаш мумкин эмас")
            
            # Юзни кодирлаш
            face_encoding = self._encode_face(image)
            if face_encoding is None:
                raise ValueError("Юз аниқланмади")
            
            # Шифрлаш
            encoding_str = base64.b64encode(pickle.dumps(face_encoding)).decode()
            encrypted_encoding = encryption_service.encrypt(encoding_str)
            
            # Базага сақлаш
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                raise ValueError("Ходим топилмади")
            
            face_record = EmployeeFace(
                employee_id=employee_id,
                face_encoding=encrypted_encoding,
                confidence=1.0
            )
            
            db.add(face_record)
            db.commit()
            
            # Кешни янгилаш
            if employee.location_id in self.face_cache:
                del self.face_cache[employee.location_id]
            
            return {
                "success": True,
                "face_id": face_record.id,
                "message": "Юз маълумоти қўшилди"
            }
        
        except Exception as e:
            db.rollback()
            logger.error(f"Юз қўшишда хатолик: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
        
        finally:
            db.close()
