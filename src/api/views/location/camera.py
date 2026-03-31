from src.api.views.base import *
from src.core.services.ai_service import AIService


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
        if not camera.stream_url:
            return Response(
                {
                    "camera_id": camera.id,
                    "camera_name": camera.name,
                    "location_id": camera.location_id,
                    "status": "error",
                    "message": "Bu kamera uchun stream URL kiritilmagan.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = AIService()
        payload = service.analyze_camera(camera)

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

