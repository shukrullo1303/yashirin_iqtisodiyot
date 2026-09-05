"""Django REST Framework serializers for location models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class LocationSerializer(BaseSerializer):
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    location_type_display = serializers.CharField(source="get_location_type_display", read_only=True)

    class Meta:
        model = models.Location
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "owner_username",
            "location_type_display",
        )


class NvrGatewaySerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    class Meta:
        model = models.NvrGateway
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")
