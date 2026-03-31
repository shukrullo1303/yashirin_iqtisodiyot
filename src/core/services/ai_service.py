import logging
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.utils import timezone

from src.core.models.location import Camera
from src.core.services.behavioral_analytics_service import BehavioralAnalyticsService
from src.core.services.camera_service import CameraService
from src.core.services.face_recognition_service import FaceRecognitionService
from src.core.services.person_detection_service import PersonDetectionService
from src.core.services.risk_scoring_service import RiskScoringService

logger = logging.getLogger(__name__)


class AIService:
    """Kamera kadri bo‘yicha AI tahlilni boshqaruvchi asosiy servis."""

    def __init__(self):
        self.camera_service = CameraService()
        self.face_service = FaceRecognitionService()
        self.person_service = PersonDetectionService()
        self.behavior_service = BehavioralAnalyticsService()
        self.risk_service = RiskScoringService()
        logger.info("AIService ready")

    async def process_frame(
        self,
        frame: np.ndarray,
        location_id: int,
        camera_id: int,
    ) -> Dict[str, Any]:
        return self.process_frame_sync(frame, location_id, camera_id)

    def process_frame_sync(
        self,
        frame: np.ndarray,
        location_id: int,
        camera_id: int,
    ) -> Dict[str, Any]:
        """Bitta kadrni tahlil qiladi."""
        timestamp = timezone.now()
        detected_persons = self.person_service.detect_persons_sync(frame)
        detected_faces = self.face_service.detect_faces(frame)

        identified_employees: List[Dict[str, Any]] = []
        draft_employees: List[Dict[str, Any]] = []
        seen_employee_ids = set()
        seen_signatures = set()

        for face in detected_faces:
            x1, y1, x2, y2 = face["bbox"]
            face_img = frame[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
            if face_img.size == 0:
                continue

            identity = self.face_service.recognize_face_sync(face_img, location_id)
            if identity.get("is_employee"):
                employee_id = identity.get("employee_id")
                if employee_id in seen_employee_ids:
                    continue
                seen_employee_ids.add(employee_id)
                identified_employees.append(
                    {
                        "id": employee_id,
                        "name": identity.get("employee_name"),
                        "confidence": identity.get("confidence", 0.0),
                    }
                )
                continue

            candidate = self.face_service.track_frequent_face(face_img, location_id)
            signature = candidate.get("signature")
            if candidate.get("employee_id") and signature not in seen_signatures:
                seen_signatures.add(signature)
                draft_employees.append(
                    {
                        "employee_id": candidate.get("employee_id"),
                        "employee_name": candidate.get("employee_name"),
                        "seen_count": candidate.get("seen_count", 0),
                        "auto_registered": candidate.get("auto_registered", False),
                    }
                )

        behavior = self.behavior_service.analyze_behavior_sync(location_id, detected_persons, timestamp)
        risk = self.risk_service.calculate_risk_score_sync(location_id, timestamp)

        return {
            "timestamp": timestamp.isoformat(),
            "camera_id": camera_id,
            "location_id": location_id,
            "detected_persons": len(detected_persons),
            "detected_faces": len(detected_faces),
            "identified_employees": identified_employees,
            "draft_employees": draft_employees,
            "behavioral_metrics": behavior,
            "risk": risk,
        }

    def analyze_camera(self, camera: Camera) -> Dict[str, Any]:
        """Kameraning joriy streamidan bitta snapshot olib tahlil qiladi."""
        stream_url = camera.stream_url or f"rtsp://{camera.ip_address}:{camera.port}/stream"
        stream_status = self.camera_service.test_camera_stream_sync(stream_url)

        if not stream_status.get("success"):
            return {
                "camera_id": camera.id,
                "camera_name": camera.name,
                "location_id": camera.location_id,
                "status": "error",
                "message": stream_status.get("error") or "Kamera streamiga ulanib bo‘lmadi.",
                "stream_status": stream_status,
            }

        frame_result = self.camera_service.capture_frame(stream_url)
        if not frame_result.get("success"):
            return {
                "camera_id": camera.id,
                "camera_name": camera.name,
                "location_id": camera.location_id,
                "status": "error",
                "message": frame_result.get("error") or "Kadrni olib bo‘lmadi.",
                "stream_status": stream_status,
            }

        analysis = self.process_frame_sync(frame_result["frame"], camera.location_id, camera.id)
        return {
            "camera_id": camera.id,
            "camera_name": camera.name,
            "location_id": camera.location_id,
            "status": "completed",
            "message": "Kamera tahlili bajarildi.",
            "stream_status": stream_status,
            "analysis": analysis,
        }

    async def run_stream_analysis(self, stream_url: str, location_id: int, camera_id: int):
        """Streamni interval bilan ketma-ket tahlil qilish."""
        cap = cv2.VideoCapture(stream_url)
        if not cap.isOpened():
            logger.error("Kamera streamiga ulanib bo‘lmadi: %s", camera_id)
            return {"success": False, "error": "Streamga ulanib bo‘lmadi"}

        frame_idx = 0
        last_analysis: Optional[Dict[str, Any]] = None
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % 25 == 0:
                    last_analysis = self.process_frame_sync(frame, location_id, camera_id)
                frame_idx += 1
        finally:
            cap.release()

        return {
            "success": True,
            "frames_processed": frame_idx,
            "last_analysis": last_analysis,
        }
