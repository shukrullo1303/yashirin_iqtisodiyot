from django.urls import include, path
from rest_framework.routers import DefaultRouter
from src.api.views.location.camera_view import camera_stream_view, camera_stream_snapshot_view
from src.api.views.dashboard_stats import DashboardStatsView
import src.core.models as models

from src.api.views.analytics.analytics import AnalyticsViewSet
from src.api.views.analytics.heat_map import HeatmapViewSet 
from src.api.views.analytics.risk_score import RiskScoreViewSet
from src.api.views.auth.current_user import CurrentUserAPIView
from src.api.views.auth.login import LoginAPIView
from src.api.views.auth.logout import LogoutAPIView
from src.api.views.auth.register import RegisterAPIView
from src.api.views.auth.csrf_token import CSRFTokenAPIView
from src.api.views.employee.employee import EmployeeViewSet
from src.api.views.employee.employee_face import EmployeeFaceViewSet
from src.api.views.location.camera import CameraViewSet
from src.api.views.location.location import LocationViewSet
from src.api.views.integration.tax_integration import TaxIntegrationViewSet
from src.api.views.integration.kkt_integration import KKTIntegrationViewSet
from src.api.views.work_log import WorkLogViewSet
from src.api.views.cafe.cafe_views import MenuCategoryViewSet, MenuItemViewSet, TableViewSet, OrderViewSet, InventoryItemViewSet
from src.api.views.cafe.staff_views import StaffViewSet
from src.api.views.cafe.analytics_views import CafeAnalyticsView
from src.api.views.auth.boss_views import BossViewSet


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
router.register(r"cafe/menu-categories", MenuCategoryViewSet, basename="menu-categories")
router.register(r"cafe/menu-items", MenuItemViewSet, basename="menu-items")
router.register(r"cafe/tables", TableViewSet, basename="cafe-tables")
router.register(r"cafe/orders", OrderViewSet, basename="cafe-orders")
router.register(r"cafe/staff", StaffViewSet, basename="cafe-staff")
router.register(r"bosses", BossViewSet, basename="bosses")
router.register(r"cafe/inventory", InventoryItemViewSet, basename="cafe-inventory")


urlpatterns = [
    # Camera stream paths MUST come before include(router.urls)
    # to prevent DRF's cameras/<pk>/ pattern from matching 'stream' as a pk.
    path('cameras/stream/snapshot/', camera_stream_snapshot_view, name='camera-stream-snapshot'),
    path('cameras/stream/', camera_stream_view, name='camera-stream'),
    path("", include(router.urls)),
    path("auth/csrf/", CSRFTokenAPIView.as_view(), name="auth-csrf"),
    path("auth/register/", RegisterAPIView.as_view(), name="auth-register"),
    path("auth/login/", LoginAPIView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutAPIView.as_view(), name="auth-logout"),
    path("auth/me/", CurrentUserAPIView.as_view(), name="auth-me"),
    path("drf-auth/", include("rest_framework.urls")),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("cafe/analytics/", CafeAnalyticsView.as_view(), name="cafe-analytics"),
]

