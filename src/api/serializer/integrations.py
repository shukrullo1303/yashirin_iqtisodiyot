"""Django REST Framework serializers for integration models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class TaxIntegrationSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.TaxIntegration
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")


class KKTIntegrationSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.KKTIntegration
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")
