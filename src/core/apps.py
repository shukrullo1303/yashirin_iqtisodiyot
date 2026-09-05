import logging
import os
import sys
import threading

from django.apps import AppConfig
from django.db import close_old_connections

logger = logging.getLogger(__name__)


def _start_camera_streams_safe():
    """ready() tugagach DB ga ulanish — Django app init ogohlantirishini oldini oladi."""
    try:
        close_old_connections()
        from src.core.services.camera_service import CameraService
        from src.core.services.visitor_monitor_service import VisitorMonitorService

        CameraService().start_active_camera_streams()
        VisitorMonitorService.start()
    except Exception as exc:
        logger.warning("Kamera oqimlarini ishga tushirishda xato: %s", exc)
    finally:
        close_old_connections()


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'src.core'

    def ready(self):
        # register signal handlers
        try:
            import src.core.signals  # noqa: F401
        except ImportError:
            pass

        if 'runserver' in sys.argv and (os.environ.get('RUN_MAIN') == 'true' or '--noreload' in sys.argv):
            from src.core.services.visitor_review_service import VisitorReviewWorker
            VisitorReviewWorker.start()

        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') == 'true' and os.environ.get('DISABLE_AUTO_CAMERA_STREAMS') != '1':
            threading.Thread(target=_start_camera_streams_safe, daemon=True).start()
