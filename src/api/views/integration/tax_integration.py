from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from src.api.views.base import *
from src.core.services.governance_service import audit


class TaxIntegrationViewSet(BaseModelViewSet):
    serializer_class = TaxIntegrationSerializer

    def get_queryset(self):
        queryset = models.TaxIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    def _can_enter_for_location(self, location):
        user = self.request.user
        if user.is_superuser:
            return True
        if user.role != "tax_inspector":
            return False
        return location.id in self._allowed_location_ids()

    def perform_create(self, serializer):
        location = serializer.validated_data["location"]
        if not self._can_enter_for_location(location):
            raise PermissionDenied("Faqat biriktirilgan lokatsiya uchun soliq ma'lumotini kiritish mumkin.")
        tax_id = serializer.validated_data.get("tax_id") or location.tax_id or f"MANUAL-{location.id}"
        row = serializer.save(
            tax_id=tax_id,
            entered_by=self.request.user,
            is_manual=True,
            last_sync=timezone.now(),
            sync_status="success",
        )
        audit(self.request.user, "create", row, f"Soliq ma'lumoti kiritildi: {row.reported_revenue:,.0f} so'm", location=location)

    def perform_update(self, serializer):
        if not self._can_enter_for_location(serializer.validated_data.get("location", serializer.instance.location)):
            raise PermissionDenied("Bu soliq yozuvini tahrirlashga ruxsat yo'q.")
        row = serializer.save(last_sync=timezone.now(), sync_status="success", is_manual=True)
        audit(self.request.user, "update", row, "Soliq ma'lumoti tahrirlandi", location=row.location)

    def perform_destroy(self, instance):
        if not self.request.user.is_superuser:
            raise PermissionDenied("Soliq yozuvini faqat superadmin o'chirishi mumkin.")
        audit(self.request.user, "delete", instance, "Soliq ma'lumoti o'chirildi", location=instance.location)
        instance.delete()

    @action(detail=False, methods=['post'], url_path='check-registration')
    def check_registration(self, request):
        """Локациянинг солиқда рўйхатдан ўтганлигини текширади"""
        location_id = request.data.get('location_id')
        if not location_id:
            return Response({'error': 'location_id kerak'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            location = models.Location.objects.get(id=location_id)
        except models.Location.DoesNotExist:
            return Response({'error': 'Локация топилмади'}, status=status.HTTP_404_NOT_FOUND)
        
        if not location.tax_id:
            return Response({'error': 'Локацияда STIR (ИНН) мавжуд эмас'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Солиқ хизмати билан интеграция (mock)
        # Аслда бу ерда солиқ хизмати API га мурожаат қилиш керак
        # tax_service_response = call_tax_api(location.tax_id)
        
        # Mock текширув: агар tax_id мавжуд бўлса ва локация тури 'cafe' ёки 'restaurant' бўлса, рўйхатдан ўтган деб ҳисоблаймиз
        # Ишлаш жойи мос келишини текширамиз (масалан, ном ва манзил)
        is_registered = self._check_workplace_match(location)
        
        # Локацияни янгилаймиз
        location.is_registered = is_registered
        location.save()
        
        return Response({
            'location_id': location_id,
            'is_registered': is_registered,
            'message': 'Рўйхатдан ўтган' if is_registered else 'Рўйхатдан ўтмаган'
        })

    def _check_workplace_match(self, location):
        """Ишлаш жойини солиқ маълумотлари билан солиштиради (mock)"""
        # Аслда бу ерда солиқ API дан маълумот олинади ва локация билан солиштирилади
        # Масалан: tax_data = get_tax_data(location.tax_id)
        # return tax_data['name'] == location.name and tax_data['address'] == location.address
        
        # Mock: агар tax_id мавжуд бўлса ва локация номида 'test' йўқ бўлса, рўйхатдан ўтган деб ҳисоблаймиз
        # Бундан ташқари, реал лойиҳада солиқ хизмати билан интеграция қилиш керак
        return bool(location.tax_id and 'test' not in location.name.lower())
