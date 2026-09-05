"""Django REST Framework serializers for employee models."""

from rest_framework import serializers
import re

from src.api.serializer.base import BaseSerializer, models


class EmployeeSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    latest_image_path = serializers.SerializerMethodField()

    def get_latest_image_path(self, obj):
        try:
            cache = getattr(obj, "_prefetched_objects_cache", None)
            if cache and "faces" in cache:
                faces = cache["faces"]
                if not faces:
                    return None
                latest = max(faces, key=lambda f: f.created_at)
                return latest.image_path
            latest_face = obj.faces.order_by("-created_at").first()
            return latest_face.image_path if latest_face else None
        except Exception:
            return None

    def validate_jshshir(self, value):
        value = (value or '').strip()
        if value and not re.fullmatch(r'\d{14}', value):
            raise serializers.ValidationError("JSHSHIR aynan 14 ta raqamdan iborat bo'lishi kerak.")
        return value or None

    class Meta:
        model = models.Employee
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name", "latest_image_path")


class EmployeeFaceSerializer(BaseSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)

    class Meta:
        model = models.EmployeeFace
        fields = "__all__"
        read_only_fields = ("id", "created_at", "employee_name")


class WorkLogSerializer(BaseSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.WorkLog
        fields = "__all__"
        read_only_fields = ("id", "created_at", "employee_name", "location_name")
