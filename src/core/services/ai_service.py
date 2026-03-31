"""
Асосий AI сервиси
Барча AI модулларини бирлаштиради
"""
from typing import List, Dict, Any, Optional
import numpy as np
import cv2
from datetime import datetime
import logging

from app.services.face_recognition_service import FaceRecognitionService
from app.services.person_detection_service import PersonDetectionService
from app.services.behavioral_analytics_service import BehavioralAnalyticsService
from app.services.predictive_analytics_service import PredictiveAnalyticsService
from app.services.risk_scoring_service import RiskScoringService

logger = logging.getLogger(__name__)


class AIService:
    """Асосий AI сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.face_recognition = FaceRecognitionService()
        self.person_detection = PersonDetectionService()
        self.behavioral_analytics = BehavioralAnalyticsService()
        self.predictive_analytics = PredictiveAnalyticsService()
        self.risk_scoring = RiskScoringService()
        logger.info("AI сервис инициализация қилинди")
    
    async def process_frame(
        self,
        frame: np.ndarray,
        location_id: int,
        camera_id: int,
        timestamp: datetime
    ) -> Dict[str, Any]:
        """
        Бир кадрни таҳлил қилиш
        Барча AI модулларини ишга туширади
        """
        results = {
            "timestamp": timestamp.isoformat(),
            "location_id": location_id,
            "camera_id": camera_id,
            "persons": [],
            "employees": [],
            "unregistered_employees": []
        }
        
        try:
            # 1. Инсонларни аниқлаш
            persons = await self.person_detection.detect_persons(frame)
            results["persons"] = persons
            
            # 2. Ходимларни таниш
            for person in persons:
                face_bbox = person.get("face_bbox")
                if face_bbox:
                    face_image = frame[
                        face_bbox[1]:face_bbox[3],
                        face_bbox[0]:face_bbox[2]
                    ]
                    
                    # Фейс-идентификация
                    face_result = await self.face_recognition.recognize_face(
                        face_image,
                        location_id
                    )
                    
                    if face_result["is_employee"]:
                        person["employee_id"] = face_result["employee_id"]
                        person["employee_name"] = face_result["employee_name"]
                        person["is_registered"] = face_result["is_registered"]
                        results["employees"].append(person)
                        
                        if not face_result["is_registered"]:
                            results["unregistered_employees"].append(person)
            
            # 3. Хулқ-атвор таҳлили
            behavioral_data = await self.behavioral_analytics.analyze_behavior(
                persons,
                timestamp
            )
            results["behavioral"] = behavioral_data
            
        except Exception as e:
            logger.error(f"Кадр таҳлилида хатолик: {e}", exc_info=True)
            results["error"] = str(e)
        
        return results
    
    async def analyze_video_stream(
        self,
        stream_url: str,
        location_id: int,
        camera_id: int,
        duration: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Видео оқимини таҳлил қилиш
        """
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            raise ValueError(f"Видео оқимини очиб бўлмади: {stream_url}")
        
        frame_count = 0
        all_results = []
        start_time = datetime.utcnow()
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Муддат текшириш
                if duration and (datetime.utcnow() - start_time).seconds > duration:
                    break
                
                # Ҳар 30-кадрда таҳлил (1 секунд)
                if frame_count % 30 == 0:
                    timestamp = datetime.utcnow()
                    result = await self.process_frame(
                        frame,
                        location_id,
                        camera_id,
                        timestamp
                    )
                    all_results.append(result)
                
                frame_count += 1
        
        finally:
            cap.release()
        
        return {
            "total_frames": frame_count,
            "analyzed_frames": len(all_results),
            "results": all_results,
            "duration": (datetime.utcnow() - start_time).total_seconds()
        }
    
    async def get_predictions(
        self,
        location_id: int,
        days: int = 30
    ) -> Dict[str, Any]:
        """Келгуси прогнозлар"""
        return await self.predictive_analytics.get_predictions(
            location_id,
            days
        )
    
    async def calculate_risk_score(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        """Риск баҳосини ҳисоблаш"""
        return await self.risk_scoring.calculate_risk_score(
            location_id,
            date
        )
