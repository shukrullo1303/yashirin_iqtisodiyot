from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.urls import include, path
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter
from rest_framework.views import APIView

import src.core.models as models
from src.api.serializer.analytics import AnalyticsSerializer, HeatmapSerializer, RiskScoreSerializer
from src.api.serializer.auth import LoginSerializer, RegisterSerializer, UserSerializer
from src.api.serializer.cameras import CameraSerializer
from src.api.serializer.employees import EmployeeFaceSerializer, EmployeeSerializer, WorkLogSerializer
from src.api.serializer.integrations import KKTIntegrationSerializer, TaxIntegrationSerializer
from src.api.serializer.locations import LocationSerializer


class BaseModelViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]


class LocationViewSet(BaseModelViewSet):
    queryset = models.Location.objects.select_related("owner").all().order_by("-id")
    serializer_class = LocationSerializer

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner")
        if owner is None and self.request.user.is_authenticated:
            owner = self.request.user
        serializer.save(owner=owner)


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
        latest_analytics = models.Analytics.objects.filter(location=camera.location).order_by("-date").first()

        payload = {
            "camera_id": camera.id,
            "camera_name": camera.name,
            "location_id": camera.location_id,
            "status": "queued",
            "message": "Kamera tahlili ishga tushirildi.",
        }

        if latest_analytics:
            payload["latest_analytics"] = {
                "date": latest_analytics.date,
                "real_customers": latest_analytics.real_customers,
                "estimated_revenue": latest_analytics.estimated_revenue,
            }

        return Response(payload, status=status.HTTP_200_OK)


class EmployeeViewSet(BaseModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = models.Employee.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset


class EmployeeFaceViewSet(BaseModelViewSet):
    serializer_class = EmployeeFaceSerializer

    def get_queryset(self):
        queryset = models.EmployeeFace.objects.select_related("employee").all().order_by("-id")
        employee_id = self.request.query_params.get("employee_id")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        return queryset


class WorkLogViewSet(BaseModelViewSet):
    serializer_class = WorkLogSerializer

    def get_queryset(self):
        queryset = models.WorkLog.objects.select_related("employee", "location").all().order_by("-id")
        employee_id = self.request.query_params.get("employee_id")
        location_id = self.request.query_params.get("location_id")

        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset


class AnalyticsViewSet(BaseModelViewSet):
    serializer_class = AnalyticsSerializer

    def get_queryset(self):
        queryset = models.Analytics.objects.select_related("location").all().order_by("-date")
        location_id = self.request.query_params.get("location_id")
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        return queryset


class RiskScoreViewSet(BaseModelViewSet):
    serializer_class = RiskScoreSerializer

    def get_queryset(self):
        queryset = models.RiskScore.objects.select_related("location").all().order_by("-date")
        location_id = self.request.query_params.get("location_id")
        date = self.request.query_params.get("date")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if date:
            queryset = queryset.filter(date__date=date)

        return queryset


class HeatmapViewSet(BaseModelViewSet):
    serializer_class = HeatmapSerializer

    def get_queryset(self):
        queryset = models.Heatmap.objects.select_related("location").all().order_by("-date", "-hour")
        location_id = self.request.query_params.get("location_id")
        date = self.request.query_params.get("date")
        hour = self.request.query_params.get("hour")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if date:
            queryset = queryset.filter(date__date=date)
        if hour:
            queryset = queryset.filter(hour=hour)

        return queryset


class TaxIntegrationViewSet(BaseModelViewSet):
    serializer_class = TaxIntegrationSerializer

    def get_queryset(self):
        queryset = models.TaxIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset


class KKTIntegrationViewSet(BaseModelViewSet):
    serializer_class = KKTIntegrationSerializer

    def get_queryset(self):
        queryset = models.KKTIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset


class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        login(request, user)

        return Response(
            {
                "message": "Muvaffaqiyatli kirildi.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class LogoutAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        logout(request)
        return Response({"message": "Muvaffaqiyatli chiqildi."}, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFTokenAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"detail": "CSRF cookie set."}, status=status.HTTP_200_OK)


router = DefaultRouter()
router.register(r"locations", LocationViewSet, basename="locations")
router.register(r"cameras", CameraViewSet, basename="cameras")
router.register(r"employees", EmployeeViewSet, basename="employees")
router.register(r"employee-faces", EmployeeFaceViewSet, basename="employee-faces")
router.register(r"work-logs", WorkLogViewSet, basename="work-logs")
router.register(r"analytics", AnalyticsViewSet, basename="analytics")
router.register(r"risk-scores", RiskScoreViewSet, basename="risk-scores")
router.register(r"heatmaps", HeatmapViewSet, basename="heatmaps")
router.register(r"tax-integrations", TaxIntegrationViewSet, basename="tax-integrations")
router.register(r"kkt-integrations", KKTIntegrationViewSet, basename="kkt-integrations")


urlpatterns = [
    path("", include(router.urls)),
    path("auth/csrf/", CSRFTokenAPIView.as_view(), name="auth-csrf"),
    path("auth/register/", RegisterAPIView.as_view(), name="auth-register"),
    path("auth/login/", LoginAPIView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutAPIView.as_view(), name="auth-logout"),
    path("auth/me/", CurrentUserAPIView.as_view(), name="auth-me"),
    path("drf-auth/", include("rest_framework.urls")),
]
