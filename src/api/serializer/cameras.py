"""Django REST Framework serializers for camera models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class CameraSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    camera_type_display = serializers.CharField(source="get_camera_type_display", read_only=True)

    class Meta:
        model = models.Camera
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "location_name",
            "camera_type_display",
        )
