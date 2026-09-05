from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.utils import timezone
from django.db.models import Sum
from django.db.models.functions import TruncDate
from django.conf import settings
from datetime import datetime, timedelta

from src.core.models.analytics import Analytics, RiskScore
from src.core.models.customer import PotentialEmployee, VisitorSession
from src.core.models.employee import Employee
from src.core.models.integration import TaxIntegration
from src.core.models.location import Location
from src.core.models.cafe import Order
from src.core.services.risk_scoring_service import RiskScoringService


class DashboardStatsView(APIView):
    """Asaka tumani kesimidagi jonli, lokatsiyalarga ajratilgan dashboard."""

    permission_classes = [permissions.IsAuthenticated]

    def _locations_for_user(self, request):
        user = request.user
        locations = Location.objects.filter(is_active=True).order_by("name")
        if user.is_superuser or user.role == "admin":
            return locations
        allowed_ids = set()
        if user.location_id:
            allowed_ids.add(user.location_id)
        if user.role == "tax_inspector":
            allowed_ids.update(user.assigned_locations.values_list("id", flat=True))
        if user.role == "business_owner":
            allowed_ids.update(user.locations.values_list("id", flat=True))
        return locations.filter(id__in=allowed_ids)

    def get(self, request):
        today = timezone.localdate()
        day_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        day_end = day_start + timedelta(days=1)
        locations = self._locations_for_user(request)
        if request.query_params.get("location_id"):
            locations = locations.filter(id=request.query_params["location_id"])

        # Dashboard davri: standartda oxirgi tugagan oy, foydalanuvchi esa
        # boshlanish va tugash sanasini o'zi tanlashi mumkin.
        first_this_month = today.replace(day=1)
        default_end = first_this_month - timedelta(days=1)
        default_start = default_end.replace(day=1)
        start_date = default_start
        end_date = default_end
        try:
            if request.query_params.get("start_date"):
                start_date = datetime.strptime(request.query_params["start_date"], "%Y-%m-%d").date()
            if request.query_params.get("end_date"):
                end_date = datetime.strptime(request.query_params["end_date"], "%Y-%m-%d").date()
        except ValueError:
            start_date, end_date = default_start, default_end
        if end_date < start_date:
            start_date, end_date = end_date, start_date
        period_start = timezone.make_aware(datetime.combine(start_date, datetime.min.time()))
        period_end = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), datetime.min.time()))
        location_ids = list(locations.values_list("id", flat=True))
        tax_rate = float(getattr(settings, 'RISK_REFERENCE_TAX_RATE', 0.12))

        totals = {key: 0 for key in (
            "locations", "today_customers", "today_employees", "inside_total", "employees",
            "estimated_revenue", "reported_revenue", "revenue_discrepancy", "risk_locations",
            "potential_employees",
            "total_orders", "total_order_revenue", "average_order", "total_tax_paid", "estimated_tax_due", "tax_gap",
        )}
        rows = []
        for location in locations:
            sessions = VisitorSession.objects.filter(location=location, entered_at__gte=day_start, entered_at__lt=day_end)
            analytics = Analytics.objects.filter(location=location, date__gte=day_start, date__lt=day_end).order_by("-id").first()
            risk = RiskScore.objects.filter(location=location, date__gte=day_start, date__lt=day_end).order_by("-id").first()
            if risk is None:
                RiskScoringService().calculate_risk_score_sync(location.id, timezone.now())
                risk = RiskScore.objects.filter(location=location, date__gte=day_start, date__lt=day_end).order_by("-id").first()
            tax = TaxIntegration.objects.filter(
                location=location, is_manual=True, report_period=today, report_period_type="daily", sync_status="success"
            ).order_by("-last_sync", "-id").first()
            risk_level = risk.risk_level if risk else "low"
            location_orders = Order.objects.filter(table__location_id=location.id, status='paid')
            location_order_revenue = sum(float(order.total or 0) for order in location_orders)
            row = {
                "location_id": location.id, "location_name": location.name,
                "today_customers": sessions.filter(is_employee=False).count(),
                "today_employees": sessions.filter(is_employee=True).count(),
                "inside_total": sessions.filter(status="inside").count(),
                "employees": Employee.objects.filter(location=location, is_active=True, status="active").count(),
                "estimated_revenue": 0.0,
                "reported_revenue": float(tax.reported_revenue) if tax else 0.0,
                "revenue_discrepancy": 0.0,
                "risk_score": float(risk.risk_score) if risk else 0.0,
                "risk_level": risk_level,
                "tax_sync_status": "success" if tax else "missing",
                "tax_last_sync": tax.last_sync if tax else None,
                "potential_employees": PotentialEmployee.objects.filter(location=location, status="pending").count(),
                "crm_order_revenue": location_order_revenue,
                "estimated_tax_due": location_order_revenue * tax_rate,
            }
            rows.append(row)
            totals["locations"] += 1
            for key in ("today_customers", "today_employees", "inside_total", "employees", "estimated_revenue", "reported_revenue", "revenue_discrepancy", "potential_employees"):
                totals[key] += row[key]
            if risk_level in {"high", "critical"}:
                totals["risk_locations"] += 1

        # Barcha ruxsat etilgan lokatsiyalarning kunlik ko'rsatkichlari.
        # Frontend bu qatorlarni oylar oralig'ida grafik va jami kartalar uchun ishlatadi.
        period_rows = list(
            Analytics.objects.filter(
                location_id__in=location_ids,
                date__gte=period_start,
                date__lt=period_end,
            )
            .annotate(day=TruncDate("date"))
            .values("day")
            .annotate(
                real_customers=Sum("real_customers"),
                reported_revenue=Sum("reported_revenue"),
                estimated_revenue=Sum("estimated_revenue"),
                discrepancy=Sum("discrepancy"),
            )
            .order_by("day")
        )
        period_analytics = [
            {
                "date": row["day"],
                "real_customers": int(row["real_customers"] or 0),
                "reported_revenue": float(row["reported_revenue"] or 0),
                "estimated_revenue": float(row["estimated_revenue"] or 0),
                "discrepancy": float(row["discrepancy"] or 0),
            }
            for row in period_rows
        ]
        crm_orders = Order.objects.filter(table__location_id__in=location_ids, status='paid')
        total_order_revenue = sum(float(order.total or 0) for order in crm_orders)
        totals['total_orders'] = crm_orders.count()
        totals['total_order_revenue'] = total_order_revenue
        totals['average_order'] = total_order_revenue / totals['total_orders'] if totals['total_orders'] else 0.0
        totals['total_tax_paid'] = float(TaxIntegration.objects.filter(
            location_id__in=location_ids, is_manual=True, sync_status='success'
        ).aggregate(total=Sum('tax_paid')).get('total') or 0.0)
        totals['estimated_tax_due'] = total_order_revenue * tax_rate
        totals['tax_gap'] = totals['estimated_tax_due'] - totals['total_tax_paid']

        return Response({
            "district_name": "Asaka tumani", "date": today, "totals": totals,
            "locations": rows,
            "period": {"start_date": start_date, "end_date": end_date},
            "period_analytics": period_analytics,
            "tax_rate": tax_rate,
            "updated_at": timezone.now(),
        })
