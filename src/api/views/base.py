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
    # These endpoints contain business, staff and camera information; they are
    # never public data.
    permission_classes = [permissions.IsAuthenticated]

    # Tenant boundary used by the general monitoring APIs.  A regular user can
    # only see data for their assigned location; a business owner can see every
    # location they own.  Administrators retain system-wide visibility.
    _LOCATION_LOOKUPS = {
        "camera": "location",
        "cameradowntime": "camera__location",
        "employee": "location",
        "employeeface": "employee__location",
        "worklog": "location",
        "analytics": "location",
        "riskscore": "location",
        "heatmap": "location",
        "visitorsession": "location",
        "potentialemployee": "location",
        "taxintegration": "location",
        "kktintegration": "location",
    }

    def _allowed_location_ids(self):
        user = self.request.user
        if user.is_superuser or user.role == "admin":
            return None
        ids = set()
        if user.location_id:
            ids.add(user.location_id)
        if user.role == "tax_inspector":
            ids.update(user.assigned_locations.values_list("id", flat=True))
        if user.role == "business_owner":
            ids.update(user.locations.values_list("id", flat=True))
        return ids

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        allowed_ids = self._allowed_location_ids()
        if allowed_ids is None:
            return queryset

        model_name = queryset.model._meta.model_name
        if model_name == "location":
            return queryset.filter(owner=self.request.user) if self.request.user.role == "business_owner" else queryset.filter(id__in=allowed_ids)

        lookup = self._LOCATION_LOOKUPS.get(model_name)
        return queryset.filter(**{f"{lookup}__in": allowed_ids}) if lookup else queryset.none()

