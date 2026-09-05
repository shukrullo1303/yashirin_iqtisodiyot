
from src.api.views.base import *
from rest_framework.exceptions import PermissionDenied


class LocationViewSet(BaseModelViewSet):
    queryset = models.Location.objects.select_related("owner").all().order_by("-id")
    serializer_class = LocationSerializer

    def perform_create(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Lokatsiyani faqat superadmin yaratadi.")
        owner = serializer.validated_data.get("owner")
        if owner is None and self.request.user.is_authenticated:
            owner = self.request.user
        serializer.save(owner=owner)

    def perform_update(self, serializer):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Lokatsiya sozlamasini faqat superadmin o'zgartiradi.")
        serializer.save()

    def perform_destroy(self, instance):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Lokatsiyani faqat superadmin o'chiradi.")
        instance.delete()

