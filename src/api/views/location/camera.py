from concurrent.futures import ThreadPoolExecutor, as_completed

from django.db import close_old_connections
from django.db.models import Q

from src.api.views.base import *
from src.core.services.ai_service import AIService


def _analyze_camera_job(camera_id: int, duration_seconds):
    """Alohida thread uchun DB ulanishini tozalab, bitta kamerani tahlil qiladi."""
    close_old_connections()
    try:
        camera = models.Camera.objects.select_related("location").get(pk=camera_id)
        service = AIService()
        payload = service.analyze_camera(camera, duration_seconds=duration_seconds)
        latest_analytics = (
            models.Analytics.objects.filter(location=camera.location).order_by("-date").first()
        )
        if latest_analytics:
            payload["latest_analytics"] = {
                "date": latest_analytics.date,
                "real_customers": latest_analytics.real_customers,
                "estimated_revenue": latest_analytics.estimated_revenue,
            }
        return payload
    finally:
        close_old_connections()


class CameraViewSet(BaseModelViewSet):
    serializer_class = CameraSerializer

    def get_queryset(self):
        queryset = models.Camera.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    def perform_create(self, serializer):
        ip_address = serializer.validated_data.get("ip_address")
        port = serializer.validated_data.get("port", 80)
        name = serializer.validated_data.get("name") or f"Camera {ip_address}"
        stream_url = serializer.validated_data.get("stream_url") or f"rtsp://{ip_address}:{port}/stream"
        serializer.save(name=name, stream_url=stream_url)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        camera = self.get_object()
        if not (camera.stream_url or "").strip() and not (camera.ip_address or "").strip():
            return Response(
                {
                    "camera_id": camera.id,
                    "camera_name": camera.name,
                    "location_id": camera.location_id,
                    "status": "error",
                    "message": "Stream URL yoki IP manzil kerak.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = AIService()
        duration_seconds = None
        if request.query_params.get("duration"):
            try:
                duration_seconds = int(request.query_params.get("duration"))
            except (TypeError, ValueError):
                duration_seconds = None

        payload = service.analyze_camera(camera, duration_seconds=duration_seconds)

        latest_analytics = models.Analytics.objects.filter(location=camera.location).order_by("-date").first()
        if latest_analytics:
            payload["latest_analytics"] = {
                "date": latest_analytics.date,
                "real_customers": latest_analytics.real_customers,
                "estimated_revenue": latest_analytics.estimated_revenue,
            }

        response_status = status.HTTP_200_OK
        if payload.get("status") == "error":
            response_status = status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(payload, status=response_status)

    @action(detail=False, methods=["post"], url_path="analyze-active")
    def analyze_active(self, request):
        """Barcha aktiv kameralarni parallel tahlil qiladi (stream yoki IP bo‘yicha)."""
        body = request.data

        def body_get(key, default=None):
            if hasattr(body, "get"):
                return body.get(key, default)
            return default

        duration_seconds = None
        raw_duration = body_get("duration")
        if raw_duration is None:
            raw_duration = request.query_params.get("duration")
        if raw_duration is not None:
            try:
                duration_seconds = int(raw_duration)
            except (TypeError, ValueError):
                duration_seconds = None

        location_id = None
        raw_loc = body_get("location_id")
        if raw_loc is not None:
            try:
                location_id = int(raw_loc)
            except (TypeError, ValueError):
                location_id = None
        if location_id is None and request.query_params.get("location_id"):
            try:
                location_id = int(request.query_params.get("location_id"))
            except (TypeError, ValueError):
                location_id = None

        qs = models.Camera.objects.filter(is_active=True).filter(
            Q(stream_url__isnull=False, stream_url__gt="") | Q(ip_address__isnull=False, ip_address__gt="")
        )
        if location_id is not None:
            qs = qs.filter(location_id=location_id)

        camera_ids = list(qs.values_list("id", flat=True))
        if not camera_ids:
            return Response(
                {
                    "count": 0,
                    "results": [],
                    "message": "Aktiv kamera topilmadi yoki stream URL / IP kiritilmagan.",
                },
                status=status.HTTP_200_OK,
            )

        max_workers = min(8, len(camera_ids))
        results = []
        errors = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(_analyze_camera_job, cid, duration_seconds): cid
                for cid in camera_ids
            }
            for future in as_completed(future_map):
                cid = future_map[future]
                try:
                    results.append(future.result())
                except Exception as exc:
                    errors.append({"camera_id": cid, "error": str(exc)})

        results.sort(key=lambda item: item.get("camera_id", 0))
        status_code = status.HTTP_200_OK
        if errors and not results:
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(
            {
                "count": len(results),
                "errors": errors,
                "results": results,
            },
            status=status_code,
        )

