"""Django REST Framework serializers for authentication and users."""

from django.contrib.auth import authenticate
from rest_framework import serializers

from src.api.serializer.base import BaseSerializer, models


class UserSerializer(BaseSerializer):
    location_name = serializers.SerializerMethodField()
    assigned_location_names = serializers.SerializerMethodField()

    class Meta:
        model = models.User
        fields = (
            "id",
            "username",
            "email",
            "full_name",
            "role",
            "location",
            "location_name",
            "assigned_locations",
            "assigned_location_names",
            "is_active",
            "is_approved",
            "is_superuser",
            "date_joined",
            "updated_at",
        )
        read_only_fields = ("id", "is_superuser", "date_joined", "updated_at", "assigned_locations", "assigned_location_names")

    def get_location_name(self, obj):
        return obj.location.name if obj.location else None

    def get_assigned_location_names(self, obj):
        return list(obj.assigned_locations.values_list("name", flat=True))


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = models.User
        # Role and location are deliberately not accepted from a public form.
        # They are assigned by an administrator during approval.
        fields = ("id", "username", "email", "full_name", "password")
        read_only_fields = ("id",)

    def validate_email(self, value):
        if models.User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Bu email bilan foydalanuvchi mavjud.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = models.User(
            **validated_data,
            role="analyst",
            is_active=False,
            is_approved=False,
        )
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = authenticate(request=request, username=attrs.get("username"), password=attrs.get("password"))

        if not user:
            raise serializers.ValidationError("Login yoki parol noto‘g‘ri.")

        if not user.is_active:
            raise serializers.ValidationError("Foydalanuvchi faol emas.")

        attrs["user"] = user
        return attrs
