"""Django REST Framework serializers for analytics models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class AnalyticsSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.Analytics
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")


class RiskScoreSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.RiskScore
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")


class HeatmapSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.Heatmap
        fields = "__all__"
        read_only_fields = ("id", "created_at", "location_name")
