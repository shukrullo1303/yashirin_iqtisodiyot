import cv2
import numpy as np
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction

# Django modellarini import qilish
from src.core.models.customer import CustomerFlow, CustomerVisit
from src.core.services.person_detection_service import PersonDetectionService

logger = logging.getLogger(__name__)


class VideoAnalyticsService:
    """Video analitika servisi - mijozlar oqimini kuzatish va tahlil qilish."""

    def __init__(self):
        self.person_detection = PersonDetectionService()
        self.tracked_persons: Dict[str, Dict[str, Any]] = {}  # track_id -> {enter_time, location_id, camera_id}
        logger.info("VideoAnalyticsService initialized")

    async def process_camera_stream(
        self,
        location_id: int,
        camera_id: int,
        stream_url: str,
        duration: Optional[int] = None
    ) -> Dict[str, Any]:
        """Kamera oqimini tahlil qilish."""
        try:
            cap = cv2.VideoCapture(stream_url)
            if not cap.isOpened():
                raise ValueError(f"Video oqimini ochib bo'lmadi: {stream_url}")

            frame_count = 0
            total_entered = 0
            total_exited = 0
            start_time = timezone.now()
            previous_detections: List[Dict[str, Any]] = []

            try:
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break

                    if duration and (timezone.now() - start_time).seconds > duration:
                        break

                    # Har 30-kadrda tahlil
                    if frame_count % 30 == 0:
                        timestamp = timezone.now()

                        # Person detection va tracking
                        current_detections = self.person_detection.detect_persons_sync(frame)
                        tracked = self.person_detection.track_persons(frame, previous_detections)

                        # Kirish-chiqishni hisoblash
                        entered, exited = self._count_entries_exits(
                            tracked, previous_detections, location_id, camera_id, timestamp
                        )

                        total_entered += entered
                        total_exited += exited
                        previous_detections = tracked

                    frame_count += 1

                # Kunlik statistikani yangilash
                self._save_daily_statistics(location_id, start_time.date(), total_entered, total_exited)

                return {
                    "success": True,
                    "location_id": location_id,
                    "total_entered": total_entered,
                    "total_exited": total_exited,
                    "timestamp": timezone.now().isoformat()
                }

            finally:
                cap.release()

        except Exception as e:
            logger.error(f"Video tahlilida xatolik: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def _count_entries_exits(
        self,
        current_detections: List[Dict[str, Any]],
        previous_detections: List[Dict[str, Any]],
        location_id: int,
        camera_id: int,
        timestamp: datetime
    ) -> tuple:
        """Kirish va chiqishlarni hisoblash."""
        entered = 0
        exited = 0

        current_track_ids = {
            str(det.get("track_id"))
            for det in current_detections
            if det.get("track_id") is not None
        }
        previous_track_ids = {
            str(det.get("track_id"))
            for det in previous_detections
            if det.get("track_id") is not None
        }

        # YANGI KIRGANLAR
        new_tracks = current_track_ids - previous_track_ids
        for track_id in new_tracks:
            if track_id not in self.tracked_persons:
                self.tracked_persons[track_id] = {
                    "enter_time": timestamp,
                    "location_id": location_id,
                    "camera_id": camera_id,
                }
                entered += 1
                # Django ORM: CustomerVisit yaratish
                CustomerVisit.objects.create(
                    location_id=location_id,
                    entered_at=timestamp,
                    track_id=track_id,
                )

        # CHIQIB KETGANLAR
        lost_tracks = previous_track_ids - current_track_ids
        for track_id in lost_tracks:
            if track_id in self.tracked_persons:
                exit_time = timestamp
                enter_time = self.tracked_persons[track_id]["enter_time"]
                stay_duration = (exit_time - enter_time).total_seconds() / 60

                # Django ORM: CustomerVisit yangilash
                visit = CustomerVisit.objects.filter(
                    track_id=track_id,
                    location_id=location_id,
                ).order_by('-entered_at').first()

                if visit:
                    visit.exited_at = exit_time
                    visit.stay_duration = stay_duration
                    visit.save()

                exited += 1
                del self.tracked_persons[track_id]

        return entered, exited

    def _save_daily_statistics(self, location_id: int, date, entered: int, exited: int):
        """Django update_or_create yordamida statistika."""
        flow, created = CustomerFlow.objects.update_or_create(
            location_id=location_id,
            date=date,
            defaults={
                'total_entered': entered,
                'total_exited': exited,
            }
        )
        if not created:
            flow.total_entered = (flow.total_entered or 0) + entered
            flow.total_exited = (flow.total_exited or 0) + exited
            flow.save()

    async def get_heatmap(self, location_id: int, date, hour: Optional[int] = None) -> Dict[str, Any]:
        """Heatmap Django QuerySet yordamida."""
        visits = CustomerVisit.objects.filter(
            location_id=location_id,
            entered_at__date=date
        )
        if hour is not None:
            visits = visits.filter(entered_at__hour=hour)

        grid_size = 50
        heatmap_grid = np.zeros((grid_size, grid_size))

        for visit in visits:
            x = hash(visit.track_id or "") % grid_size
            y = (hash(visit.track_id or "") // grid_size) % grid_size
            heatmap_grid[y, x] += 1

        return {
            "heatmap_data": heatmap_grid.tolist(),
            "max_intensity": int(np.max(heatmap_grid)) if visits.exists() else 0
        }

    def clear_tracking(self):
        """Tracking ma'lumotlarini tozalash."""
        self.tracked_persons.clear()