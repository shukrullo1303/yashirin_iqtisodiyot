import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from src.core.models.location import Camera, CameraDowntime
from src.core.services.camera_service import CameraService

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Camera)
def camera_downtime_transition(sender, instance, **kwargs):
    if not instance.pk:
        return
    previous = Camera.objects.filter(pk=instance.pk).values('is_active').first()
    if not previous or previous['is_active'] == instance.is_active:
        return
    now = timezone.now()
    if not instance.is_active:
        CameraDowntime.objects.create(camera=instance, started_at=now, reason='Admin tomonidan nofaol qilindi')
    else:
        open_period = CameraDowntime.objects.filter(camera=instance, ended_at__isnull=True).order_by('-started_at').first()
        if open_period:
            open_period.ended_at = now
            open_period.save(update_fields=['ended_at', 'updated_at'])


@receiver(post_save, sender=Camera)
def camera_post_save(sender, instance: Camera, created: bool, **kwargs):
    # 0, 1 kabi lokal USB webcamlar brauzer orqali olinadi. Django fon
    # jarayoni Windows'da ularni band qilib yoki ruxsat xatosiga olib kelishi
    # mumkin; RTSP/HTTP manbalar esa quyidagi shared stream orqali ishlaydi.
    if (instance.stream_url or '').strip().isdigit():
        return
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
