import logging
from typing import Any, Dict, List, Optional

import cv2
from django.conf import settings

try:
    from onvif import ONVIFCamera
except ImportError:  # pragma: no cover - optional dependency
    ONVIFCamera = None

from src.core.models.location import Camera

logger = logging.getLogger(__name__)


class CameraService:
    """IP kamera va streamlar bilan ishlash uchun servis."""

    def __init__(self):
        logger.info("CameraService loaded")

    def connect_camera_sync(
        self,
        ip_address: str,
        port: int = 80,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """ONVIF orqali kameraga ulanib stream URL olish."""
        if ONVIFCamera is None:
            return {
                "success": False,
                "error": "onvif paketi o‘rnatilmagan. RTSP stream URL orqali ishlatish mumkin.",
            }

        try:
            user = username or getattr(settings, "ONVIF_DEFAULT_USERNAME", "admin")
            pwd = password or getattr(settings, "ONVIF_DEFAULT_PASSWORD", "admin")

            my_cam = ONVIFCamera(ip_address, port, user, pwd)
            media_service = my_cam.create_media_service()
            profiles = media_service.GetProfiles()

            if not profiles:
                raise ValueError(f"{ip_address}: profil topilmadi")

            main_profile = profiles[0]
            stream_setup = {
                "StreamSetup": {
                    "Stream": "RTP-Unicast",
                    "Transport": {"Protocol": "RTSP"},
                },
                "ProfileToken": main_profile.token,
            }
            stream_uri = media_service.GetStreamUri(stream_setup)
            resolution = getattr(main_profile.VideoEncoderConfiguration, "Resolution", None)

            return {
                "success": True,
                "ip_address": ip_address,
                "stream_url": stream_uri.Uri,
                "profile_token": main_profile.token,
                "resolution": f"{resolution.Width}x{resolution.Height}" if resolution else None,
            }
        except Exception as exc:
            logger.error("Camera connect error (%s): %s", ip_address, exc)
            return {"success": False, "error": str(exc)}

    async def connect_camera(
        self,
        ip_address: str,
        port: int = 80,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.connect_camera_sync(ip_address, port, username, password)

    def test_camera_stream_sync(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Kamera stream ishlayotganini tekshiradi."""
        if not stream_url:
            return {
                "success": False,
                "status": "offline",
                "error": "Stream URL kiritilmagan",
            }

        cap = None
        try:
            cap = cv2.VideoCapture(stream_url)
            if hasattr(cv2, "CAP_PROP_BUFFERSIZE"):
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout * 1000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout * 1000)

            if not cap.isOpened():
                return {
                    "success": False,
                    "status": "offline",
                    "error": "Video oqimini ochib bo‘lmadi",
                }

            ret, frame = cap.read()
            if not ret or frame is None:
                return {
                    "success": False,
                    "status": "offline",
                    "error": "Kadrni o‘qib bo‘lmadi",
                }

            height, width = frame.shape[:2]
            return {
                "success": True,
                "status": "online",
                "resolution": f"{width}x{height}",
            }
        except Exception as exc:
            logger.error("Stream test error: %s", exc, exc_info=True)
            return {"success": False, "status": "offline", "error": str(exc)}
        finally:
            if cap is not None:
                cap.release()

    async def test_camera_stream(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        return self.test_camera_stream_sync(stream_url, timeout)

    def capture_frame(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Streamdan bitta kadr oladi."""
        if not stream_url:
            return {"success": False, "error": "Stream URL kiritilmagan"}

        cap = None
        try:
            cap = cv2.VideoCapture(stream_url)
            if hasattr(cv2, "CAP_PROP_BUFFERSIZE"):
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout * 1000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout * 1000)

            if not cap.isOpened():
                return {"success": False, "error": "Kamera streamiga ulanib bo‘lmadi"}

            ret, frame = cap.read()
            if not ret or frame is None:
                return {"success": False, "error": "Kadrni olish imkoni bo‘lmadi"}

            height, width = frame.shape[:2]
            return {
                "success": True,
                "frame": frame,
                "resolution": f"{width}x{height}",
            }
        except Exception as exc:
            logger.error("Frame capture error: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}
        finally:
            if cap is not None:
                cap.release()

    async def update_camera_statuses(self, location_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Barcha aktiv kameralar holatini tekshiradi."""
        query = Camera.objects.filter(is_active=True)
        if location_id:
            query = query.filter(location_id=location_id)

        results: List[Dict[str, Any]] = []
        for camera in query.order_by("id"):
            status_info = self.test_camera_stream_sync(camera.stream_url or "")
            results.append(
                {
                    "id": camera.id,
                    "name": camera.name,
                    "location_id": camera.location_id,
                    "status": status_info.get("status", "offline"),
                    "error": status_info.get("error"),
                }
            )

        return results

    def get_active_cameras_list(self, location_id: int) -> List[Dict[str, Any]]:
        """Lokatsiya bo‘yicha faol kameralar ro‘yxatini qaytaradi."""
        return list(
            Camera.objects.filter(location_id=location_id, is_active=True).values(
                "id",
                "name",
                "ip_address",
                "stream_url",
                "camera_type",
                "fps",
                "resolution",
            )
        )