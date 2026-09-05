from rest_framework import serializers
from src.api.serializer.base import BaseSerializer, models


class CameraDowntimeSerializer(BaseSerializer):
    camera_name = serializers.CharField(source='camera.name', read_only=True)
    location_name = serializers.CharField(source='camera.location.name', read_only=True)
    duration_minutes = serializers.FloatField(read_only=True)

    class Meta:
        model = models.CameraDowntime
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'updated_at', 'camera_name', 'location_name', 'duration_minutes')
