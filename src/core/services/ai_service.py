import logging
import cv2
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional
from django.utils import timezone
from django.conf import settings

# Ички сервисларни импорт қилиш
from src.ai.services.face_recognition import FaceRecognitionService
from src.ai.services.person_detection import PersonDetectionService
from src.ai.services.behavioral_analytics import BehavioralAnalyticsService
from src.core.models.analytics import AIProcessingLog

logger = logging.getLogger(__name__)

class AIService:
    """Асосий AI Контроллери - Барча модулларни бошқаради"""
    
    def __init__(self):
        # Модулларни инициализация қилиш
        self.face_service = FaceRecognitionService()
        self.person_service = PersonDetectionService()
        self.behavior_service = BehavioralAnalyticsService()
        logger.info("Барча AI модуллари муваффақиятли юкланди")

    async def process_frame(
        self, 
        frame: np.ndarray, 
        location_id: int, 
        camera_id: int
    ) -> Dict[str, Any]:
        """Бир дона кадрни тўлиқ таҳлил қилиш цикли"""
        timestamp = timezone.now()
        
        results = {
            "timestamp": timestamp,
            "camera_id": camera_id,
            "detected_persons": 0,
            "identified_employees": [],
            "alerts": []
        }

        try:
            # 1-ҚАДАМ: Инсонларни ва уларнинг координатларини аниқлаш
            persons = await self.person_service.detect_persons(frame)
            results["detected_persons"] = len(persons)

            # 2-ҚАДАМ: Ҳар бир аниқланган инсонни текшириш
            for person in persons:
                # Агар юз координатлари бўлса, юзни танишга юбориш
                face_box = person.get("face_bbox")
                if face_box:
                    x1, y1, x2, y2 = face_box
                    face_img = frame[y1:y2, x1:x2]
                    
                    if face_img.size > 0:
                        identity = await self.face_service.recognize_face(face_img, location_id)
                        
                        if identity["is_employee"]:
                            results["identified_employees"].append({
                                "id": identity["employee_id"],
                                "name": identity["employee_name"],
                                "confidence": identity["confidence"]
                            })

            # 3-ҚАДАМ: Хулқ-атвор ва навбат таҳлили
            behavior = await self.behavior_service.analyze_behavior(location_id, persons, timestamp)
            results["behavioral_metrics"] = behavior

            # 4-ҚАДАМ: Натижаларни логлаш (Ихтиёрий)
            # AIProcessingLog.objects.create(camera_id=camera_id, result_json=results)

        except Exception as e:
            logger.error(f"AI Processing Error: {e}", exc_info=True)
            results["error"] = str(e)

        return results

    async def run_stream_analysis(self, stream_url: str, location_id: int, camera_id: int):
        """Видео оқимини реал вақтда (ёки интервал билан) таҳлил қилиш"""
        cap = cv2.VideoCapture(stream_url)
        
        if not cap.isOpened():
            logger.error(f"Камерага уланиб бўлмади: {camera_id}")
            return

        frame_idx = 0
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                # Процессорни юклаб юбормаслик учун ҳар 25-кадрни (1 секунд) таҳлил қиламиз
                if frame_idx % 25 == 0:
                    analysis = await self.process_frame(frame, location_id, camera_id)
                    
                    # Агар муҳим воқеа содир бўлса (масалан, бегона шахс кирса) хабар бериш
                    if analysis.get("detected_persons", 0) > 0:
                        logger.info(f"Камера {camera_id}: {analysis['detected_persons']} одам аниқланди")

                frame_idx += 1
                
        finally:
            cap.release()