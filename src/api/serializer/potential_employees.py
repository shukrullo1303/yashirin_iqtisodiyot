from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class PotentialEmployeeSerializer(BaseSerializer):
    visitor_id = serializers.CharField(source="visitor_session.visitor_id", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    entry_image_path = serializers.CharField(source="visitor_session.entry_image_path", read_only=True)
    exit_image_path = serializers.CharField(source="visitor_session.exit_image_path", read_only=True)
    entered_at = serializers.DateTimeField(source="visitor_session.entered_at", read_only=True)
    exited_at = serializers.DateTimeField(source="visitor_session.exited_at", read_only=True)

    class Meta:
        model = models.PotentialEmployee
        fields = ("id", "visitor_session", "visitor_id", "location", "location_name", "detected_at", "duration_minutes", "image_path", "entry_image_path", "exit_image_path", "entered_at", "exited_at", "status", "employee")
        read_only_fields = fields
