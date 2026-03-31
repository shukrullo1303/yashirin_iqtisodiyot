from rest_framework import serializers

import src.core.models as models


class BaseSerializer(serializers.ModelSerializer):
    """Common serializer with safe datetime formatting."""

    @staticmethod
    def _format_datetime(value):
        if not value:
            return None
        return value.strftime("%Y-%m-%d %H:%M")

    def to_representation(self, instance):
        representation = super().to_representation(instance)

        if hasattr(instance, "created_at"):
            representation["created_at"] = self._format_datetime(getattr(instance, "created_at", None))

        if hasattr(instance, "updated_at"):
            representation["updated_at"] = self._format_datetime(getattr(instance, "updated_at", None))

        return representation