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

