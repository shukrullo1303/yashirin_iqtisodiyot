import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from src.core.models.location import Camera
from src.core.services.camera_service import CameraService

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Camera)
def camera_post_save(sender, instance: Camera, created: bool, **kwargs):
    if instance.is_active and instance.stream_url:
        started = CameraService().start_camera_stream(instance, persistent=True)
        if started:
            logger.info('Started persistent stream for camera %s', instance)
        return

    if instance.stream_url:
        stopped = CameraService().stop_camera_stream(instance.stream_url)
        if stopped:
            logger.info('Stopped stream for inactive or removed camera URL %s', instance.stream_url)


@receiver(post_delete, sender=Camera)
def camera_post_delete(sender, instance: Camera, **kwargs):
    if instance.stream_url:
        stopped = CameraService().stop_camera_stream(instance.stream_url)
        if stopped:
            logger.info('Stopped stream after camera deletion: %s', instance.stream_url)
