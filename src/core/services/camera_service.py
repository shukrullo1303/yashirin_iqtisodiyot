"""
Камера сервиси
ONVIF камералар билан ишлаш
"""
from typing import Dict, Any, Optional, List
import logging
from onvif import ONVIFCamera
import cv2

from app.core.config import settings
from app.models.location import Camera
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


class CameraService:
    """Камера сервиси"""
    
    def __init__(self):
        """Инициализация"""
        logger.info("Camera сервис инициализация қилинди")
    
    async def connect_camera(
        self,
        ip_address: str,
        port: int = 80,
        username: str = None,
        password: str = None
    ) -> Dict[str, Any]:
        """
        Камерага уланиш
        """
        try:
            username = username or settings.ONVIF_USERNAME
            password = password or settings.ONVIF_PASSWORD
            
            # ONVIF камера
            camera = ONVIFCamera(
                ip_address,
                port,
                username,
                password
            )
            
            # Камера маълумотлари
            media_service = camera.create_media_service()
            profiles = media_service.GetProfiles()
            
            if not profiles:
                raise ValueError("Камера профиллари топилмади")
            
            profile = profiles[0]
            
            # Stream URL
            stream_setup = {
                'StreamSetup': {
                    'Stream': 'RTP-Unicast',
                    'Transport': {'Protocol': 'RTSP'}
                },
                'ProfileToken': profile.token
            }
            
            stream_uri = media_service.GetStreamUri(stream_setup)
            
            return {
                "success": True,
                "ip_address": ip_address,
                "port": port,
                "stream_url": stream_uri.Uri,
                "profile_token": profile.token,
                "resolution": f"{profile.VideoEncoderConfiguration.Resolution.Width}x{profile.VideoEncoderConfiguration.Resolution.Height}"
            }
        
        except Exception as e:
            logger.error(f"Камерага уланишда хатолик: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def test_camera_stream(
        self,
        stream_url: str,
        timeout: int = 10
    ) -> Dict[str, Any]:
        """
        Камера оқимини текшириш
        """
        try:
            cap = cv2.VideoCapture(stream_url)
            cap.set(cv2.CAP_PROP_TIMEOUT, timeout * 1000)
            
            if not cap.isOpened():
                return {
                    "success": False,
                    "error": "Оқимни очиб бўлмади"
                }
            
            ret, frame = cap.read()
            cap.release()
            
            if ret and frame is not None:
                return {
                    "success": True,
                    "resolution": f"{frame.shape[1]}x{frame.shape[0]}",
                    "channels": frame.shape[2] if len(frame.shape) > 2 else 1
                }
            else:
                return {
                    "success": False,
                    "error": "Кадр олиб бўлмади"
                }
        
        except Exception as e:
            logger.error(f"Оқимни текширишда хатолик: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_camera_status(
        self,
        camera_id: int
    ) -> Dict[str, Any]:
        """
        Камера статусини олиш
        """
        db = SessionLocal()
        try:
            camera = db.query(Camera).filter(Camera.id == camera_id).first()
            
            if not camera:
                return {
                    "success": False,
                    "error": "Камера топилмади"
                }
            
            # Оқимни текшириш
            stream_status = await self.test_camera_stream(camera.stream_url or "")
            
            return {
                "success": True,
                "camera_id": camera_id,
                "name": camera.name,
                "ip_address": camera.ip_address,
                "is_active": camera.is_active,
                "stream_status": stream_status,
                "last_check": None  # Базада сақлаш керак
            }
        
        finally:
            db.close()
    
    async def list_cameras(
        self,
        location_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Камералар рўйхати
        """
        db = SessionLocal()
        try:
            query = db.query(Camera)
            if location_id:
                query = query.filter(Camera.location_id == location_id)
            
            cameras = query.all()
            
            return [
                {
                    "id": cam.id,
                    "name": cam.name,
                    "location_id": cam.location_id,
                    "ip_address": cam.ip_address,
                    "is_active": cam.is_active,
                    "camera_type": cam.camera_type,
                    "stream_url": cam.stream_url
                }
                for cam in cameras
            ]
        
        finally:
            db.close()
