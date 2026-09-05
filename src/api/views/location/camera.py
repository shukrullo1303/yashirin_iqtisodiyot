from src.api.views.base import *
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Max
from src.core.services.camera_service import CameraService
from src.api.views.location.camera_view import _LOCAL_MONITORS, _LOCAL_CAMERA_ANALYSIS


class CameraViewSet(BaseModelViewSet):
    """Camera settings only; visitor analysis is always handled in background."""

    serializer_class = CameraSerializer

    def get_queryset(self):
        queryset = models.Camera.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        return queryset.filter(location_id=location_id) if location_id else queryset

    def perform_create(self, serializer):
        location = serializer.validated_data["location"]
        if not self._can_manage_location(location):
            raise PermissionDenied("Kamerani faqat superadmin yoki shu lokatsiya egasi boshqaradi.")
        ip_address = serializer.validated_data.get("ip_address")
        port = serializer.validated_data.get("port", 80)
        name = serializer.validated_data.get("name") or f"Camera {ip_address}"
        stream_url = serializer.validated_data.get("stream_url") or f"rtsp://{ip_address}:{port}/stream"
        serializer.save(name=name, stream_url=stream_url)

    def _can_manage_location(self, location):
        user = self.request.user
        return user.is_superuser

    def perform_update(self, serializer):
        location = serializer.validated_data.get("location", serializer.instance.location)
        if not self._can_manage_location(location):
            raise PermissionDenied("Kamera sozlamasini o'zgartirishga ruxsat yo'q.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self._can_manage_location(instance.location):
            raise PermissionDenied("Kamerani o'chirishga ruxsat yo'q.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="health")
    def health(self, request):
        """Kamera haqiqatan kadr berayotganini tekshiradi.

        Faol/nofaol sozlamasining o‘zi "online" degani emas: ayniqsa lokal
        webcam boshqa dastur tomonidan band bo‘lsa, UI oldin noto‘g‘ri yashil
        holatni ko‘rsatar edi. Shared hubdan kadr so‘rash yangi ulanish
        ochmaydi va real holatni qaytaradi.
        """
        rows = self.filter_queryset(self.get_queryset()).annotate(last_event=Max("visitorevent__occurred_at"))
        camera_service = CameraService()
        result = []
        checked_urls = {}
        for camera in rows:
            is_configured = bool(camera.stream_url)
            if camera.is_active and is_configured:
                # Browserda ishlayotgan lokal webcamni server qayta ochishga
                # urinsa Windows uni band deb qaytaradi. Browser frame endpoint
                # monitorini ko'rgan bo'lsak, haqiqiy holat ONLINE hisoblanadi.
                if (camera.stream_url or '').strip().isdigit():
                    is_online = camera.id in _LOCAL_MONITORS
                    error = None if is_online else "Brauzer webcamdan hali kadr yubormadi"
                else:
                    stream_state = checked_urls.get(camera.stream_url)
                    if stream_state is None:
                        stream_state = camera_service.capture_frame(camera.stream_url, timeout=1)
                        checked_urls[camera.stream_url] = stream_state
                    is_online = bool(stream_state.get("success"))
                    error = None if is_online else stream_state.get("error", "Kadr olinmadi")
            else:
                is_online, error = False, None
            result.append({
                "camera_id": camera.id, "name": camera.name, "location_name": camera.location.name,
                "is_active": camera.is_active, "configured": is_configured,
                "last_event": camera.last_event,
                "last_analysis": _LOCAL_CAMERA_ANALYSIS.get(camera.id) or camera.last_event,
                "status": "online" if is_online else "offline", "error": error,
            })
        return Response(result)
