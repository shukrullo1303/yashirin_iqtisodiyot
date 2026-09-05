from rest_framework.exceptions import PermissionDenied
from src.api.views.base import BaseModelViewSet, models
from src.api.serializer.locations import NvrGatewaySerializer
from src.core.services.governance_service import audit


class NvrGatewayViewSet(BaseModelViewSet):
    serializer_class = NvrGatewaySerializer
    queryset = models.NvrGateway.objects.select_related("location")

    def get_queryset(self):
        # Gateway manzili tarmoq infratuzilmasi ma'lumoti hisoblanadi.
        # Uni faqat haqiqiy superadmin ko'ra olishi mumkin.
        if not self.request.user.is_superuser:
            return self.queryset.none()
        return super().get_queryset()

    def _manage(self):
        if not self.request.user.is_superuser: raise PermissionDenied("NVR gatewayni faqat superadmin boshqaradi.")
    def perform_create(self, serializer):
        self._manage(); row = serializer.save(); audit(self.request.user, "create", row, f"NVR gateway qo‘shildi: {row.name}", location=row.location)
    def perform_update(self, serializer):
        self._manage(); row = serializer.save(); audit(self.request.user, "update", row, f"NVR gateway tahrirlandi: {row.name}", location=row.location)
    def perform_destroy(self, instance):
        self._manage(); audit(self.request.user, "delete", instance, f"NVR gateway o‘chirildi: {instance.name}", location=instance.location); instance.delete()
