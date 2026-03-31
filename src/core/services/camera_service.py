import logging
import cv2
from typing import Dict, Any, Optional, List
from onvif import ONVIFCamera
from django.conf import settings
from django.db import transaction
from django.utils import timezone

# Моделларни импорт қилиш
from src.core.models.location import Camera

logger = logging.getLogger(__name__)

class CameraService:
    """IP камералар билан ишлаш сервиси (ONVIF & RTSP)"""
    
    def __init__(self):
        logger.info("CameraService (Django) муваффақиятли юкланди")

    async def connect_camera(
        self, 
        ip_address: str, 
        port: int = 80, 
        username: str = None, 
        password: str = None
    ) -> Dict[str, Any]:
        """ONVIF орқали камерага уланиш ва RTSP URL олиш"""
        try:
            user = username or settings.ONVIF_DEFAULT_USERNAME
            pwd = password or settings.ONVIF_DEFAULT_PASSWORD
            
            # ONVIF алоқасини ўрнатиш
            my_cam = ONVIFCamera(ip_address, port, user, pwd)
            
            # Медиа хизматини яратиш
            media_service = my_cam.create_media_service()
            profiles = media_service.GetProfiles()
            
            if not profiles:
                raise ValueError(f"{ip_address}: Профиллар топилмади")
            
            # Биринчи (одатда асосий/HD) профилни олиш
            main_profile = profiles[0]
            
            # Оқим (Stream) созламалари
            stream_setup = {
                'StreamSetup': {
                    'Stream': 'RTP-Unicast',
                    'Transport': {'Protocol': 'RTSP'}
                },
                'ProfileToken': main_profile.token
            }
            
            stream_uri = media_service.GetStreamUri(stream_setup)
            
            res = main_profile.VideoEncoderConfiguration.Resolution
            return {
                "success": True,
                "ip_address": ip_address,
                "stream_url": stream_uri.Uri,
                "profile_token": main_profile.token,
                "resolution": f"{res.Width}x{res.Height}"
            }
        
        except Exception as e:
            logger.error(f"Камера уланиш хатоси ({ip_address}): {e}")
            return {"success": False, "error": str(e)}

    async def test_camera_stream(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Камера оқими ишлаётганини OpenCV орқали текшириш"""
        try:
            # OpenCV орқали видеони очиш
            cap = cv2.VideoCapture(stream_url)
            # Уланиш вақти лимити (миллисонияда)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout * 1000)
            
            if not cap.isOpened():
                return {"success": False, "error": "Видео оқимини очиб бўлмади (RTSP error)"}
            
            # Битта кадр ўқиб кўриш
            ret, frame = cap.read()
            cap.release()
            
            if ret and frame is not None:
                h, w, _ = frame.shape
                return {
                    "success": True, 
                    "resolution": f"{w}x{h}",
                    "status": "online"
                }
            
            return {"success": False, "error": "Кадр олишда хатолик"}
            
        except Exception as e:
            logger.error(f"Stream Test Error: {e}")
            return {"success": False, "error": str(e)}

    async def update_camera_statuses(self, location_id: Optional[int] = None):
        """Барча камераларнинг ҳолатини текшириш ва базани янгилаш"""
        query = Camera.objects.filter(is_active=True)
        if location_id:
            query = query.filter(location_id=location_id)
            
        cameras = query.all()
        results = []

        for cam in cameras:
            status_info = await self.test_camera_stream(cam.stream_url)
            
            # Базадаги ҳолатни янгилаш
            cam.last_status = "online" if status_info["success"] else "offline"
            cam.last_check = timezone.now()
            if not status_info["success"]:
                cam.error_log = status_info.get("error")
            
            cam.save(update_fields=['last_status', 'last_check', 'error_log'])
            results.append({"id": cam.id, "status": cam.last_status})
            
        return results

    def get_active_cameras_list(self, location_id: int) -> List[Dict]:
        """Локация бўйича фаол камералар рўйхати (Django ORM)"""
        return list(Camera.objects.filter(
            location_id=location_id, 
            is_active=True
        ).values('id', 'name', 'ip_address', 'stream_url', 'camera_type', 'last_status'))