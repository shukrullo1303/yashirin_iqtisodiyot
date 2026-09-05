from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from src.core.models.customer import VisitorRetentionSetting


class VisitorRetentionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    ALLOWED_HOURS = {24, 24 * 7, 24 * 10}

    def get(self, request):
        setting, _ = VisitorRetentionSetting.objects.get_or_create(pk=1, defaults={"retention_hours": 24})
        return Response({"retention_hours": setting.retention_hours})

    def post(self, request):
        if request.user.role not in {"admin", "tax_inspector"} and not request.user.is_superuser:
            return Response({"detail": "Faqat admin yoki soliq inspektori o'zgartira oladi."}, status=status.HTTP_403_FORBIDDEN)
        try:
            hours = int(request.data.get("retention_hours"))
        except (TypeError, ValueError):
            hours = 0
        if hours not in self.ALLOWED_HOURS:
            return Response({"retention_hours": ["24 soat, 7 kun yoki 10 kun tanlang."]}, status=status.HTTP_400_BAD_REQUEST)
        setting, _ = VisitorRetentionSetting.objects.update_or_create(pk=1, defaults={"retention_hours": hours})
        return Response({"retention_hours": setting.retention_hours, "message": "Mijoz ma'lumotlari saqlash muddati yangilandi."})
