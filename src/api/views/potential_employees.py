from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from src.api.serializer.potential_employees import PotentialEmployeeSerializer
from src.api.views.base import BaseModelViewSet, models
from src.core.services.visitor_review_service import register_reviewed_employee


class PotentialEmployeeViewSet(BaseModelViewSet):
    serializer_class = PotentialEmployeeSerializer
    http_method_names = ["get", "head", "options", "post"]

    def get_queryset(self):
        qs = models.PotentialEmployee.objects.select_related("location", "visitor_session", "employee")
        if self.request.query_params.get('status') == 'pending':
            qs = qs.filter(status='pending', visitor_session__is_employee=False)
        location_id = self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    @action(detail=True, methods=["post"])
    def register(self, request, pk=None):
        if not request.user.is_superuser and request.user.role != 'tax_inspector':
            return Response({'detail': 'Faqat superadmin yoki biriktirilgan soliq inspektori tasdiqlaydi.'}, status=status.HTTP_403_FORBIDDEN)
        alert = self.get_object()
        if alert.status != "pending":
            return Response({"detail": "Bu nomzod avval ro'yxatdan o'tgan."}, status=status.HTTP_400_BAD_REQUEST)
        full_name = str(request.data.get("full_name", "")).strip()
        if not full_name:
            return Response({"full_name": ["Ism-familiya majburiy."]}, status=status.HTTP_400_BAD_REQUEST)
        jshshir = str(request.data.get('jshshir') or request.data.get('inn') or '').strip()
        if not jshshir.isdigit() or len(jshshir) != 14:
            return Response({'jshshir': ['JSHSHIR aynan 14 ta raqamdan iborat bo\'lishi kerak.']}, status=status.HTTP_400_BAD_REQUEST)
        employee = register_reviewed_employee(alert.visitor_session, request.data)
        return Response({"employee_id": employee.id, "message": "Xodim ro'yxatdan o'tkazildi."})
