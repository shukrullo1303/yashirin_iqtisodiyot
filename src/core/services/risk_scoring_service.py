import logging
import numpy as np
from typing import Dict, Any, List
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Avg

from src.core.models.employee import Employee
from src.core.models.analytics import Analytics, RiskScore
from src.core.models.customer import CustomerFlow

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

        # 2. Tushum tafovuti (oxirgi 30 kunlik)
        analytics = (
            Analytics.objects.filter(
                location_id=location_id,
                date__gte=date - timedelta(days=30),
            )
            .order_by("-date")
            .first()
        )

        if analytics:
            factors["revenue_discrepancy"] = analytics.discrepancy
            factors["discrepancy_percentage"] = analytics.discrepancy_percentage
            reported_revenue = analytics.reported_revenue
        else:
            factors["revenue_discrepancy"] = 0.0
            factors["discrepancy_percentage"] = 0.0
            reported_revenue = 0

        # 3. Mijozlar oqimi va soliq solishtirish (oxirgi 7 kun)
        seven_days_ago = (date - timedelta(days=7)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        avg_customers = (
            CustomerFlow.objects.filter(
                location_id=location_id,
                date__gte=seven_days_ago,
            ).aggregate(avg=Avg("total_entered"))["avg"]
            or 0
        )

        estimated_revenue = avg_customers * 50000
        factors["revenue_ratio"] = (
            estimated_revenue / reported_revenue if reported_revenue > 0 else 0.0
        )

        factors["work_time_discrepancy"] = 0.0
        factors["kkt_operations_count"] = 0

        return factors

    def _calculate_score(self, factors: Dict[str, Any]) -> float:
        score = 0.0

        # 30% — ro'yxatdan o'tmagan xodimlar
        unregistered = factors.get("unregistered_employees_count", 0)
        score += min(30, unregistered * 10)

        # 40% — tushum foizidagi farq
        discrepancy_pct = abs(factors.get("discrepancy_percentage", 0))
        if discrepancy_pct > 50:
            score += 40
        elif discrepancy_pct > 30:
            score += 30
        elif discrepancy_pct > 20:
            score += 20
        elif discrepancy_pct > 10:
            score += 10

        # 20% — tushum nisbati (taxminiy vs real)
        revenue_ratio = factors.get("revenue_ratio", 1.0)
        if revenue_ratio < 0.5:
            score += 20
        elif revenue_ratio < 0.7:
            score += 15
        elif revenue_ratio < 0.9:
            score += 10

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
        if score >= 70:
            recs.append("Yuqori risk! Darhol inspeksiya tavsiya etiladi.")
        return recs
