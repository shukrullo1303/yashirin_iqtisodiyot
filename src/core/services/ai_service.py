import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.conf import settings
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
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Bitta kadrni tahlil qiladi."""
        if timestamp is None:
            timestamp = timezone.now()

        detected_persons = self.person_service.detect_persons_sync(frame)
        detected_faces = self.face_service.detect_faces(frame)

        identified_employees: List[Dict[str, Any]] = []
        draft_employees: List[Dict[str, Any]] = []
        clients: List[Dict[str, Any]] = []
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
                        "source": "known_employee",
                    }
                )
                continue

            signature = self.face_service.get_face_signature(face_img)
            presence = None
            if signature:
                presence = self.face_service.update_face_presence(signature, location_id, timestamp)

            if presence and presence.get("is_employee"):
                identified_employees.append(
                    {
                        "id": None,
                        "name": "Uzoq muddatli yuz (xodimdan xavotir)",
                        "confidence": 0.0,
                        "source": "presence_threshold",
                        "seen_minutes": round(presence.get("total_seconds", 0) / 60, 1),
                    }
                )
            else:
                clients.append(
                    {
                        "signature": signature,
                        "seen_minutes": round(presence.get("total_seconds", 0) / 60, 1) if presence else 0,
                        "status": "customer",
                    }
                )

            candidate = self.face_service.track_frequent_face(face_img, location_id)
            signature_id = candidate.get("signature")
            if candidate.get("employee_id") and signature_id not in seen_signatures:
                seen_signatures.add(signature_id)
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
            "clients": clients,
            "behavioral_metrics": behavior,
            "risk": risk,
        }

    def analyze_camera(self, camera: Camera, duration_seconds: int = None) -> Dict[str, Any]:
        """Kamera streamidan ketma-ket kadrlar oladi va doimiy tahlil qiladi."""
        stream_url = camera.stream_url or f"rtsp://{camera.ip_address}:{camera.port}/stream"
        stream_status = self.camera_service.test_camera_stream_sync(stream_url)

        if not stream_status.get("success"):
            logger.warning(
                "Stream testi muvaffaqiyatsiz: %s (%s). Analizni davom ettiraman.",
                stream_url,
                stream_status.get("error"),
            )

        run_duration = duration_seconds if duration_seconds is not None else getattr(settings, "CAMERA_ANALYSIS_DURATION_SECONDS", 60)
        analysis = self.run_stream_analysis_sync(
            stream_url,
            camera.location_id,
            camera.id,
            duration_seconds=run_duration,
        )
        if not analysis.get("success"):
            return {
                "camera_id": camera.id,
                "camera_name": camera.name,
                "location_id": camera.location_id,
                "status": "error",
                "message": analysis.get("error") or "Stream orqali tahlilni boshlashda xatolik.",
                "stream_status": stream_status,
            }

        return {
            "camera_id": camera.id,
            "camera_name": camera.name,
            "location_id": camera.location_id,
            "status": "completed",
            "message": "Kamera stream tahlili bajarildi.",
            "stream_status": stream_status,
            "analysis": analysis,
        }

    def _run_http_stream_analysis_sync(
        self,
        stream_url: str,
        location_id: int,
        camera_id: int,
        duration_seconds: int = 60,
        frame_skip: int = 25,
    ) -> Dict[str, Any]:
        """HTTP stream uchun fallback qilib ketma-ket kadrlar oladi."""
        frame_idx = 0
        analysis_count = 0
        last_analysis: Optional[Dict[str, Any]] = None
        start_time = timezone.now()

        failure_count = 0
        while True:
            if duration_seconds and (timezone.now() - start_time).total_seconds() >= duration_seconds:
                break

            result = self.camera_service.capture_frame(stream_url, timeout=5)
            if not result.get("success") or result.get("frame") is None:
                failure_count += 1
                if failure_count >= 3:
                    time.sleep(0.5)
                else:
                    time.sleep(0.2)
                continue

            failure_count = 0
            frame = result["frame"]
            if frame_idx % frame_skip == 0:
                last_analysis = self.process_frame_sync(
                    frame,
                    location_id,
                    camera_id,
                    timestamp=timezone.now(),
                )
                analysis_count += 1
            frame_idx += 1

        if analysis_count == 0 and not last_analysis:
            logger.warning(
                "HTTP stream analizida biron bir kadr olinmadi: %s",
                stream_url,
            )

        return {
            "success": True,
            "frames_processed": frame_idx,
            "analysis_count": analysis_count,
            "duration_seconds": min(int((timezone.now() - start_time).total_seconds()), duration_seconds),
            "last_analysis": last_analysis,
        }

    def run_stream_analysis_sync(
        self,
        stream_url: str,
        location_id: int,
        camera_id: int,
        duration_seconds: int = 60,
        frame_skip: int = 25,
    ) -> Dict[str, Any]:
        """Streamni interval bilan ketma-ket tahlil qiladi."""
        frame_idx = 0
        analysis_count = 0
        last_analysis: Optional[Dict[str, Any]] = None
        start_time = timezone.now()

        failure_count = 0
        while True:
            if duration_seconds and (timezone.now() - start_time).total_seconds() >= duration_seconds:
                break

            result = self.camera_service.capture_frame(stream_url, timeout=5)
            if not result.get("success") or result.get("frame") is None:
                failure_count += 1
                if failure_count > 10:
                    logger.warning("Kamera streamdan kadr olishda uzluksizlik bor: %s", stream_url)
                time.sleep(0.2)
                continue

            failure_count = 0
            frame = result["frame"]
            if frame_idx % frame_skip == 0:
                last_analysis = self.process_frame_sync(
                    frame,
                    location_id,
                    camera_id,
                    timestamp=timezone.now(),
                )
                analysis_count += 1
            frame_idx += 1

        return {
            "success": True,
            "frames_processed": frame_idx,
            "analysis_count": analysis_count,
            "duration_seconds": min(int((timezone.now() - start_time).total_seconds()), duration_seconds),
            "last_analysis": last_analysis,
        }

    async def run_stream_analysis(self, stream_url: str, location_id: int, camera_id: int):
        return self.run_stream_analysis_sync(stream_url, location_id, camera_id)
