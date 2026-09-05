"""Django REST Framework serializers for camera models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class CameraSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    camera_type_display = serializers.CharField(source="get_camera_type_display", read_only=True)

    class Meta:
        model = models.Camera
        fields = "__all__"
        # Never expose camera login credentials through a list/retrieve API.
        extra_kwargs = {
            "password": {"write_only": True},
            "username": {"write_only": True},
        }
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "location_name",
            "camera_type_display",
        )
