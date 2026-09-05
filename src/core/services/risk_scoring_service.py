import logging
import numpy as np
from typing import Dict, Any, List
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.db.models import Avg

from src.core.models.employee import Employee
from src.core.models.analytics import Analytics, RiskScore
from src.core.models.location import Camera
from src.core.models.customer import CustomerFlow, PotentialEmployee, VisitorSession
from src.core.models.integration import KKTIntegration, TaxIntegration
from src.core.models.location import Location
from src.core.models.cafe import Order
from src.core.services.governance_service import notify

logger = logging.getLogger(__name__)


class RiskScoringService:
    """Risk baholash servisi."""

    def __init__(self):
        logger.info("RiskScoringService tayyor")

    async def calculate_risk_score(self, location_id: int, date: datetime) -> Dict[str, Any]:
        return self.calculate_risk_score_sync(location_id, date)

    def calculate_risk_score_sync(self, location_id: int, date: datetime) -> Dict[str, Any]:
        """Risk bahosini hisoblaydi. Kuniga bitta yozuv saqlaydi (update_or_create)."""
        try:
            factors = self._collect_factors_sync(location_id, date)
            risk_score = self._calculate_score(factors)
            risk_level = self._get_risk_level(risk_score)

            # Bir kunda bir marta yozamiz — takroriy CREATE o'rniga update_or_create
            day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
            RiskScore.objects.update_or_create(
                location_id=location_id,
                date=day_start,
                defaults={
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                    "factors": factors,
                    "unregistered_employees": factors.get("unregistered_employees_count", 0),
                    "revenue_discrepancy": factors.get("revenue_discrepancy", 0.0),
                },
            )

            return {
                "location_id": location_id,
                "date": date.isoformat(),
                "risk_score": float(risk_score),
                "risk_level": risk_level,
                "factors": factors,
                "recommendations": self._get_recommendations(risk_score, factors),
            }

        except Exception as exc:
            logger.error("Risk baholashda xatolik: %s", exc, exc_info=True)
            return {"error": str(exc)}

    def refresh_daily_analytics_sync(self, location_id: int, date: datetime = None) -> Dict[str, Any]:
        """Kamera va soliqdagi kunlik ma'lumotni birlashtirib, riskni yangilaydi.

        Bu usul fon monitoringidan chaqiriladi; operator tugma bosishi shart emas.
        Soliq API hali sozlanmagan bo'lsa ham kamera ko'rsatkichlari yoziladi,
        lekin faqat ma'lumot yo'qligi uchun risk oshirilmaydi.
        """
        date = date or timezone.now()
        day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        customer_count = VisitorSession.objects.filter(
            location_id=location_id, is_employee=False,
            entered_at__gte=day_start, entered_at__lt=day_end,
        ).count()
        # Kamera oqimidan tushum taxmin qilinmaydi. Bugungi qo'lda kiritilgan
        # rasmiy ma'lumot bo'lmasa, tushum bo'yicha AI/risk tahlili o'tkazilmaydi.
        tax = TaxIntegration.objects.filter(
            location_id=location_id, is_manual=True, report_period=day_start.date(),
            report_period_type="daily", sync_status="success"
        ).order_by("-last_sync", "-id").first()
        reported = float(tax.reported_revenue) if tax else 0.0
        if not tax:
            notify(key=f"tax-missing-{location_id}-{day_start.date().isoformat()}", title="Soliq ma'lumoti kiritilmagan", message="Bugungi rasmiy tushum kiritilmagani uchun tushum AI tahlili o'chirilgan.", level="error", location=Location.objects.get(pk=location_id))
        discrepancy = 0.0
        discrepancy_percentage = 0.0
        daily = Analytics.objects.filter(location_id=location_id, date__gte=day_start, date__lt=day_end).order_by("-id").first()
        values = {
            "real_customers": customer_count,
            "estimated_revenue": 0.0,
            "reported_revenue": reported,
            "average_check": 0.0,
            "discrepancy": discrepancy,
            "discrepancy_percentage": discrepancy_percentage,
        }
        if daily:
            Analytics.objects.filter(pk=daily.pk).update(**values)
        else:
            Analytics.objects.create(location_id=location_id, date=day_start, **values)
        return self.calculate_risk_score_sync(location_id, date)

    async def _collect_factors(self, location_id: int, date: datetime) -> Dict[str, Any]:
        return self._collect_factors_sync(location_id, date)

    def _collect_factors_sync(self, location_id: int, date: datetime) -> Dict[str, Any]:
        """Risk omillarini to'playdi."""
        factors: Dict[str, Any] = {}

        # 1. Ro'yxatdan o'tmagan xodimlar
        unregistered_count = Employee.objects.filter(
            location_id=location_id,
            is_registered=False,
            is_active=True,
        ).count()
        factors["unregistered_employees_count"] = unregistered_count

        # 2. Tushum faqat inspektor kiritgan rasmiy kunlik yozuv mavjud bo'lsa
        # ko'rsatiladi. Kamera asosida pul summasi hisoblanmaydi.
        analytics = (
            Analytics.objects.filter(
                location_id=location_id,
                date__gte=date - timedelta(days=30),
            )
            .order_by("-date")
            .first()
        )

        tax_report_available = bool(analytics and analytics.reported_revenue > 0)
        factors["tax_report_available"] = tax_report_available
        if tax_report_available:
            factors["revenue_discrepancy"] = analytics.discrepancy
            factors["discrepancy_percentage"] = analytics.discrepancy_percentage
            reported_revenue = analytics.reported_revenue
        else:
            factors["revenue_discrepancy"] = 0.0
            factors["discrepancy_percentage"] = 0.0
            reported_revenue = 0

        factors["revenue_ratio"] = 0.0

        # Kamera oqimi va inspektor kiritgan to'langan soliq tushum to'liq
        # bo'lmasa ham risk tahliliga kiradi. Kamera tushumni taxmin qilmaydi.
        day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        factors["customer_count"] = VisitorSession.objects.filter(
            location_id=location_id, entered_at__gte=day_start, entered_at__lt=day_end,
            is_employee=False,
        ).count()
        factors["employee_count"] = VisitorSession.objects.filter(
            location_id=location_id, entered_at__gte=day_start, entered_at__lt=day_end,
            is_employee=True,
        ).count()
        camera_total = Camera.objects.filter(location_id=location_id).count()
        inactive_cameras = Camera.objects.filter(location_id=location_id, is_active=False).count()
        factors["camera_count"] = camera_total
        factors["inactive_camera_count"] = inactive_cameras
        factors["camera_availability_percentage"] = round(
            ((camera_total - inactive_cameras) / camera_total) * 100, 2
        ) if camera_total else 0.0
        tax_row = TaxIntegration.objects.filter(
            location_id=location_id, is_manual=True, sync_status="success",
            report_period=day_start.date(), report_period_type="daily",
        ).order_by("-last_sync", "-id").first()
        if tax_row is None:
            tax_row = TaxIntegration.objects.filter(
                location_id=location_id, is_manual=True, sync_status="success",
                report_period__year=day_start.year, report_period__month=day_start.month,
                report_period_type="monthly",
            ).order_by("-last_sync", "-id").first()
        factors["tax_paid"] = float(tax_row.tax_paid) if tax_row else 0.0
        factors["tax_report_available"] = bool(tax_row)
        # CRMdagi haqiqiy to'langan zakazlar bilan soliqchi kiritgan tushum
        # alohida signal sifatida solishtiriladi. Bu kamera taxmini emas.
        # Soliq hisobotini shu kunning CRM zakazlari bilan solishtiramiz;
        # tarixiy barcha zakazlarni qo'shib yuborish riskni sun'iy oshiradi.
        crm_orders = Order.objects.filter(
            table__location_id=location_id,
            status='paid',
            opened_at__gte=day_start,
            opened_at__lt=day_start + timedelta(days=1),
        )
        crm_revenue = sum(float(order.total or 0) for order in crm_orders)
        tax_revenue = float(tax_row.reported_revenue) if tax_row else 0.0
        factors["crm_order_count"] = crm_orders.count()
        factors["crm_revenue"] = round(crm_revenue, 2)
        factors["tax_reported_revenue"] = round(tax_revenue, 2)
        factors["crm_tax_revenue_gap"] = round(crm_revenue - tax_revenue, 2) if tax_row else 0.0
        factors["crm_tax_revenue_gap_percentage"] = round(
            abs(crm_revenue - tax_revenue) / max(crm_revenue, 1) * 100, 2
        ) if tax_row and crm_revenue else 0.0
        factors["tax_per_customer"] = round(factors["tax_paid"] / max(1, factors["customer_count"]), 2)
        avg_ticket = float(getattr(settings, "RISK_AVERAGE_TICKET", 40000))
        reference_rate = float(getattr(settings, "RISK_REFERENCE_TAX_RATE", 0.12))
        factors["reference_average_ticket"] = avg_ticket
        factors["reference_tax_rate"] = reference_rate
        factors["scenario_turnover"] = round(factors["customer_count"] * avg_ticket, 2)
        factors["scenario_tax"] = round(factors["scenario_turnover"] * reference_rate, 2)
        factors["scenario_tax_gap"] = round(max(factors["scenario_tax"] - factors["tax_paid"], 0), 2)
        factors["scenario_tax_gap_percentage"] = round(
            factors["scenario_tax_gap"] / factors["scenario_tax"] * 100, 2
        ) if factors["scenario_tax"] else 0.0

        factors["potential_employees_count"] = PotentialEmployee.objects.filter(
            location_id=location_id, status="pending"
        ).count()
        kkt = KKTIntegration.objects.filter(location_id=location_id, sync_status="success").order_by("-last_sync", "-id").first()
        factors["kkt_operations_count"] = int(kkt.total_receipts) if kkt else 0

        factors["work_time_discrepancy"] = 0.0

        return factors

    def _calculate_score(self, factors: Dict[str, Any]) -> float:
        score = 0.0

        # 30% — ro'yxatdan o'tmagan xodimlar
        unregistered = factors.get("unregistered_employees_count", 0)
        score += min(30, unregistered * 10)

        # Mijoz oqimi va kiritilgan to'langan soliq alohida signal beradi.
        # Bu tushumni taxmin qilish emas: faqat kamera qaydi va inspektor
        # kiritgan soliq mavjudligini solishtirish.
        customers = factors.get("customer_count", 0)
        tax_paid = factors.get("tax_paid", 0.0)
        if customers >= 100:
            score += 20
        elif customers >= 50:
            score += 10
        elif customers >= 10:
            score += 5
        if customers > 0 and tax_paid <= 0:
            score += 25
        elif customers >= 50 and factors.get("tax_per_customer", 0) < 1000:
            score += 15
        elif customers >= 20 and factors.get("tax_per_customer", 0) < 500:
            score += 10
        inactive_cameras = factors.get("inactive_camera_count", 0)
        camera_total = factors.get("camera_count", 0)
        if camera_total and inactive_cameras >= camera_total:
            score += 25
        elif inactive_cameras:
            score += min(15, inactive_cameras * 8)
        gap_pct = factors.get("scenario_tax_gap_percentage", 0)
        if tax_paid > 0 and gap_pct >= 75:
            score += 20
        elif tax_paid > 0 and gap_pct >= 50:
            score += 10
        crm_gap_pct = factors.get("crm_tax_revenue_gap_percentage", 0)
        if factors.get("tax_report_available") and crm_gap_pct >= 50:
            score += 20
        elif factors.get("tax_report_available") and crm_gap_pct >= 25:
            score += 10

        # Tushum tafovuti faqat real rasmiy tushum va kelajakdagi tasdiqlangan
        # solishtirish manbasi mavjud bo'lganda hisoblanadi.
        discrepancy_pct = abs(factors.get("discrepancy_percentage", 0))
        if discrepancy_pct > 50:
            score += 40
        elif discrepancy_pct > 30:
            score += 30
        elif discrepancy_pct > 20:
            score += 20
        elif discrepancy_pct > 10:
            score += 10

        # Kamera uzoq vaqt bo'lgan, ammo ro'yxatga olinmagan xodimlarni ham oladi.
        score += min(10, factors.get("potential_employees_count", 0) * 5)

        return min(100.0, score)

    def _get_risk_level(self, score: float) -> str:
        if score >= 70:
            return "critical"
        elif score >= 50:
            return "high"
        elif score >= 30:
            return "medium"
        return "low"

    def _get_recommendations(self, score: float, factors: Dict[str, Any]) -> List[str]:
        recs = []
        unregistered = factors.get("unregistered_employees_count", 0)
        if unregistered > 0:
            recs.append(f"Ro'yxatdan o'tmagan xodimlar aniqlandi: {unregistered} ta.")
        if abs(factors.get("discrepancy_percentage", 0)) > 20:
            recs.append(
                f"Tushum tafovuti yuqori: {factors['discrepancy_percentage']:.1f}%."
            )
        if factors.get("customer_count", 0) > 0 and factors.get("tax_paid", 0) <= 0:
            recs.append("Mijoz oqimi qayd etilgan, ammo to'langan soliq kiritilmagan.")
        if factors.get("scenario_tax_gap", 0) > 0:
            recs.append(
                f"AI ssenariysida taxminiy soliq tafovuti: {factors['scenario_tax_gap']:,.0f} so'm."
            )
        if factors.get("crm_tax_revenue_gap_percentage", 0) >= 25:
            direction = 'kam' if factors.get('crm_tax_revenue_gap', 0) > 0 else 'ko‘p'
            recs.append(f"CRM zakaz tushumi va soliqchi kiritgan summa tafovuti: soliq ma’lumoti {direction} ko‘rsatilgan ({factors['crm_tax_revenue_gap_percentage']:.1f}%).")
        if factors.get("inactive_camera_count", 0):
            recs.append(
                f"{factors['inactive_camera_count']} ta kamera nofaol: kamera uzilishi sababli nazorat to'liq emas."
            )
        if score >= 70:
            recs.append("Yuqori risk! Darhol inspeksiya tavsiya etiladi.")
        return recs
