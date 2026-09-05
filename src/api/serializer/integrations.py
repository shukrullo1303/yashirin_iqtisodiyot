"""Django REST Framework serializers for integration models."""

from rest_framework import serializers
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone

from src.api.serializer.base import BaseSerializer, models


class TaxIntegrationSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    entered_by_name = serializers.CharField(source="entered_by.full_name", read_only=True)
    # Qo‘lda kunlik/oylik hisobot kiritishda STIR qayta so‘ralmaydi.
    tax_id = serializers.CharField(required=False, allow_blank=True, default="")
    crm_calculated_tax = serializers.SerializerMethodField()

    def get_crm_calculated_tax(self, obj):
        """Shu hisobot davridagi CRM to‘langan zakazlaridan nazorat solig‘i."""
        from src.core.models.cafe import Order
        period = obj.report_period
        start = timezone.make_aware(datetime.combine(period, datetime.min.time()))
        if obj.report_period_type == 'monthly':
            next_month = (period.replace(day=28) + timedelta(days=4)).replace(day=1)
            end = timezone.make_aware(datetime.combine(next_month, datetime.min.time()))
        else:
            end = start + timedelta(days=1)
        orders = Order.objects.filter(table__location_id=obj.location_id, status='paid', opened_at__gte=start, opened_at__lt=end)
        revenue = sum(float(order.total or 0) for order in orders)
        return round(revenue * float(getattr(settings, 'RISK_REFERENCE_TAX_RATE', 0.12)), 2)

    class Meta:
        model = models.TaxIntegration
        fields = "__all__"
        extra_kwargs = {"crm_calculated_tax": {"read_only": True}}
        read_only_fields = ("id", "created_at", "updated_at", "location_name", "entered_by", "entered_by_name", "is_manual", "last_sync", "sync_status")


class KKTIntegrationSerializer(BaseSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = models.KKTIntegration
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at", "location_name")
