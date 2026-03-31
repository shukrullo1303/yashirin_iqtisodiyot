import os
import sys

from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'src.core'

    def ready(self):
        # register signal handlers
        try:
            import src.core.signals  # noqa: F401
        except ImportError:
            pass

        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') == 'true':
            from src.core.services.camera_service import CameraService

            CameraService().start_active_camera_streams()
