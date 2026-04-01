"""Django REST Framework serializers for employee models."""

from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class EmployeeSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    latest_image_path = serializers.SerializerMethodField()

    def get_latest_image_path(self, obj):
        latest_face = obj.faces.order_by('-created_at').first()
        return latest_face.image_path if latest_face else None

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
