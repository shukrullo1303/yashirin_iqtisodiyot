from rest_framework import serializers


class NewsSerializer(serializers.Serializer):
    """Placeholder serializer for future news endpoints."""

    title = serializers.CharField(max_length=255)
    content = serializers.CharField()
    published_at = serializers.DateTimeField(required=False, allow_null=True)