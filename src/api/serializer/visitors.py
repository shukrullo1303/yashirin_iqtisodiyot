from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models
from src.core.services.visitor_timing import visit_timing


class VisitorEventSerializer(serializers.ModelSerializer):
    camera_name = serializers.CharField(source="camera.name", read_only=True)

    class Meta:
        model = models.VisitorEvent
        fields = ("id", "event_type", "occurred_at", "image_path", "is_manual", "camera", "camera_name")


class VisitorSessionSerializer(BaseSerializer):
    today_stay_duration = serializers.SerializerMethodField()
    current_stay_duration = serializers.SerializerMethodField()
    last_entry_at = serializers.SerializerMethodField()

    def _timing(self, obj):
        if not hasattr(obj, '_display_timing'):
            obj._display_timing = visit_timing(obj)
        return obj._display_timing

    def get_today_stay_duration(self, obj):
        return self._timing(obj)['today_minutes']

    def get_current_stay_duration(self, obj):
        return self._timing(obj)['current_minutes']

    def get_last_entry_at(self, obj):
        return self._timing(obj)['current_entry']

    location_name = serializers.CharField(source="location.name", read_only=True)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    employee_monitoring_id = serializers.CharField(source="employee.monitoring_id", read_only=True)
    entry_camera_name = serializers.CharField(source="entry_camera.name", read_only=True)
    exit_camera_name = serializers.CharField(source="exit_camera.name", read_only=True)
    events = VisitorEventSerializer(many=True, read_only=True)

    class Meta:
        model = models.VisitorSession
        # face_embedding is deliberately absent: it is biometric material.
        fields = (
            "id", "visitor_id", "location", "location_name", "entry_camera",
            "entry_camera_name", "exit_camera", "exit_camera_name", "entered_at",
            "exited_at", "last_seen_at", "stay_duration", "status", "is_long_stay", "is_anonymous",
            "today_stay_duration", "current_stay_duration", "last_entry_at",
            "is_employee", "employee", "employee_name", "employee_monitoring_id", "entry_image_path", "exit_image_path", "entry_body_image_path", "exit_body_image_path",
            "biometric_purged_at", "events", "created_at", "updated_at",
        )
        read_only_fields = fields
