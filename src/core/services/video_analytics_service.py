"""
Видеоаналитика сервиси
Видео оқимларини таҳлил қилиш
"""
import cv2
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import logging
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.customer import CustomerFlow, CustomerVisit
from app.models.location import Location
from app.services.ai_service import AIService
from app.services.person_detection_service import PersonDetectionService

logger = logging.getLogger(__name__)


class VideoAnalyticsService:
    """Видеоаналитика сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.ai_service = AIService()
        self.person_detection = PersonDetectionService()
        self.tracked_persons = {}  # track_id -> {enter_time, location_id, camera_id}
        logger.info("Video Analytics сервис инициализация қилинди")
    
    async def process_camera_stream(
        self,
        location_id: int,
        camera_id: int,
        stream_url: str,
        duration: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Камера оқимини таҳлил қилиш
        """
        try:
            # Видео оқимини очиш
            cap = cv2.VideoCapture(stream_url)
            if not cap.isOpened():
                raise ValueError(f"Видео оқимини очиб бўлмади: {stream_url}")
            
            frame_count = 0
            total_entered = 0
            total_exited = 0
            start_time = datetime.utcnow()
            previous_detections = []
            
            db = SessionLocal()
            
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
                        
                        # Инсонларни аниқлаш
                        current_detections = await self.person_detection.detect_persons(frame)
                        
                        # Tracking
                        tracked = await self.person_detection.track_persons(
                            frame,
                            previous_detections
                        )
                        
                        # Кириш-чиқишни ҳисоблаш
                        entered, exited = await self._count_entries_exits(
                            tracked,
                            previous_detections,
                            location_id,
                            camera_id,
                            timestamp,
                            db
                        )
                        
                        total_entered += entered
                        total_exited += exited
                        
                        previous_detections = tracked
                    
                    frame_count += 1
                
                # Кунлик статистикани сақлаш
                await self._save_daily_statistics(
                    location_id,
                    start_time.date(),
                    total_entered,
                    total_exited,
                    db
                )
                
                db.commit()
                
                return {
                    "success": True,
                    "location_id": location_id,
                    "camera_id": camera_id,
                    "duration_seconds": (datetime.utcnow() - start_time).total_seconds(),
                    "total_frames": frame_count,
                    "total_entered": total_entered,
                    "total_exited": total_exited,
                    "timestamp": datetime.utcnow().isoformat()
                }
            
            finally:
                cap.release()
                db.close()
        
        except Exception as e:
            logger.error(f"Видео таҳлилида хатолик: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _count_entries_exits(
        self,
        current_detections: List[Dict[str, Any]],
        previous_detections: List[Dict[str, Any]],
        location_id: int,
        camera_id: int,
        timestamp: datetime,
        db: Session
    ) -> tuple:
        """Кириш-чиқишни ҳисоблаш"""
        entered = 0
        exited = 0
        
        # Янги детекциялар (кириш)
        current_track_ids = {det.get("track_id") for det in current_detections if det.get("track_id")}
        previous_track_ids = {det.get("track_id") for det in previous_detections if det.get("track_id")}
        
        new_tracks = current_track_ids - previous_track_ids
        for track_id in new_tracks:
            if track_id not in self.tracked_persons:
                # Янги мижоз
                self.tracked_persons[track_id] = {
                    "enter_time": timestamp,
                    "location_id": location_id,
                    "camera_id": camera_id
                }
                entered += 1
                
                # Базага сақлаш
                visit = CustomerVisit(
                    location_id=location_id,
                    entered_at=timestamp,
                    track_id=str(track_id)
                )
                db.add(visit)
        
        # Йўқолган детекциялар (чиқиш)
        lost_tracks = previous_track_ids - current_track_ids
        for track_id in lost_tracks:
            if track_id in self.tracked_persons:
                person_data = self.tracked_persons[track_id]
                
                # Чиқиш вақти
                exit_time = timestamp
                enter_time = person_data["enter_time"]
                stay_duration = (exit_time - enter_time).total_seconds() / 60  # Минутларда
                
                # Базада янгилаш
                visit = db.query(CustomerVisit).filter(
                    CustomerVisit.track_id == str(track_id),
                    CustomerVisit.location_id == location_id
                ).order_by(CustomerVisit.entered_at.desc()).first()
                
                if visit:
                    visit.exited_at = exit_time
                    visit.stay_duration = stay_duration
                
                exited += 1
                del self.tracked_persons[track_id]
        
        return entered, exited
    
    async def _save_daily_statistics(
        self,
        location_id: int,
        date: datetime.date,
        total_entered: int,
        total_exited: int,
        db: Session
    ):
        """Кунлик статистикани сақлаш"""
        date_start = datetime.combine(date, datetime.min.time())
        
        flow = db.query(CustomerFlow).filter(
            CustomerFlow.location_id == location_id,
            CustomerFlow.date >= date_start,
            CustomerFlow.date < date_start + timedelta(days=1)
        ).first()
        
        if flow:
            flow.total_entered += total_entered
            flow.total_exited += total_exited
            flow.updated_at = datetime.utcnow()
        else:
            flow = CustomerFlow(
                location_id=location_id,
                date=date_start,
                total_entered=total_entered,
                total_exited=total_exited
            )
            db.add(flow)
    
    async def get_heatmap(
        self,
        location_id: int,
        date: datetime.date,
        hour: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Юклама харитасини олиш
        """
        db = SessionLocal()
        try:
            # Визитларни олиш
            date_start = datetime.combine(date, datetime.min.time())
            date_end = date_start + timedelta(days=1)
            
            if hour is not None:
                date_start = date_start.replace(hour=hour)
                date_end = date_start + timedelta(hours=1)
            
            visits = db.query(CustomerVisit).filter(
                CustomerVisit.location_id == location_id,
                CustomerVisit.entered_at >= date_start,
                CustomerVisit.entered_at < date_end
            ).all()
            
            # Grid яратиш (содда версия)
            grid_size = 50
            heatmap_grid = np.zeros((grid_size, grid_size))
            
            for visit in visits:
                # Содда тақсимлаш (аслда камера координаталаридан олиш керак)
                x = hash(visit.track_id) % grid_size
                y = (hash(visit.track_id) // grid_size) % grid_size
                heatmap_grid[y, x] += 1
            
            return {
                "location_id": location_id,
                "date": date.isoformat(),
                "hour": hour,
                "heatmap_data": heatmap_grid.tolist(),
                "max_intensity": int(np.max(heatmap_grid))
            }
        
        finally:
            db.close()
