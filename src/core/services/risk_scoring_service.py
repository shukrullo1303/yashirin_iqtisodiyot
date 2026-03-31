import logging
import numpy as np
from typing import Dict, Any, List
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Avg, Sum

# Django modellarini import qilish
from src.core.models.employee import Employee
from src.core.models.analytics import Analytics, RiskScore
from src.core.models.customer import CustomerFlow

logger = logging.getLogger(__name__)

class RiskScoringService:
    """Риск баҳолаш сервиси (Django версия)"""
    
    def __init__(self):
        logger.info("Risk Scoring сервис (Django) инициализация қилинди")
    
    async def calculate_risk_score(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        return self.calculate_risk_score_sync(location_id, date)

    def calculate_risk_score_sync(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        """Риск баҳосини ҳисоблаш"""
        try:
            factors = self._collect_factors_sync(location_id, date)
            risk_score = self._calculate_score(factors)
            risk_level = self._get_risk_level(risk_score)

            RiskScore.objects.create(
                location_id=location_id,
                date=date,
                risk_score=risk_score,
                risk_level=risk_level,
                factors=factors,
                unregistered_employees=factors.get("unregistered_employees_count", 0),
                revenue_discrepancy=factors.get("revenue_discrepancy", 0.0)
            )

            return {
                "location_id": location_id,
                "date": date.isoformat(),
                "risk_score": float(risk_score),
                "risk_level": risk_level,
                "factors": factors,
                "recommendations": self._get_recommendations(risk_score, factors)
            }

        except Exception as e:
            logger.error(f"Риск баҳолашда хатолик: {e}", exc_info=True)
            return {"error": str(e)}
    
    async def _collect_factors(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        return self._collect_factors_sync(location_id, date)

    def _collect_factors_sync(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        """Риск омилларини тўплаш (Django ORM)"""
        factors = {}
        
        # 1. Норасмий ходимлар
        unregistered_employees_count = Employee.objects.filter(
            location_id=location_id,
            is_registered=False,
            is_active=True
        ).count()
        factors["unregistered_employees_count"] = unregistered_employees_count
        
        # 2. Тушум тафовути (Oxirgi 30 kunlik analitika)
        analytics = Analytics.objects.filter(
            location_id=location_id,
            date__gte=date - timedelta(days=30)
        ).order_by('-date').first()
        
        if analytics:
            factors["revenue_discrepancy"] = analytics.discrepancy
            factors["discrepancy_percentage"] = analytics.discrepancy_percentage
            reported_revenue = analytics.reported_revenue
        else:
            factors["revenue_discrepancy"] = 0.0
            factors["discrepancy_percentage"] = 0.0
            reported_revenue = 0
        
        # 3. Мижозлар ва солиқ солиштириш (Oxirgi 7 kunlik oqim)
        customer_flow = CustomerFlow.objects.filter(
            location_id=location_id,
            date__gte=(date - timedelta(days=7)).date()
        )
        
        # O'rtacha mijozlar sonini hisoblash
        avg_customers = customer_flow.aggregate(Avg('total_entered'))['total_entered__avg'] or 0
        
        # Тахминий тушум (O'rtacha chek 50,000 so'm deb olsak)
        estimated_revenue = avg_customers * 50000 
        
        if reported_revenue > 0:
            factors["revenue_ratio"] = estimated_revenue / reported_revenue
        else:
            factors["revenue_ratio"] = 0.0
        
        # 4. Qo'shimcha omillar (Kelajakda WorkLog yoki KKT dan olinadi)
        factors["work_time_discrepancy"] = 0.0
        factors["kkt_operations_count"] = 0
        
        return factors
    
    def _calculate_score(self, factors: Dict[str, Any]) -> float:
        """Риск баҳосини ҳисобlash logikasi"""
        score = 0.0
        
        # 30% - Norasmiy xodimlar uchun
        unregistered = factors.get("unregistered_employees_count", 0)
        score += min(30, unregistered * 10)
        
        # 40% - Tushum foizidagi farq uchun
        discrepancy_pct = abs(factors.get("discrepancy_percentage", 0))
        if discrepancy_pct > 50: score += 40
        elif discrepancy_pct > 30: score += 30
        elif discrepancy_pct > 20: score += 20
        elif discrepancy_pct > 10: score += 10
        
        # 20% - Tushum nisbati (Taxminiy vs Real)
        revenue_ratio = factors.get("revenue_ratio", 1.0)
        if revenue_ratio < 0.5: score += 20
        elif revenue_ratio < 0.7: score += 15
        elif revenue_ratio < 0.9: score += 10
        
        return min(100, score)
    
    def _get_risk_level(self, score: float) -> str:
        if score >= 70: return "critical"
        elif score >= 50: return "high"
        elif score >= 30: return "medium"
        return "low"
    
    def _get_recommendations(self, score: float, factors: Dict[str, Any]) -> List[str]:
        recommendations = []
        if factors.get("unregistered_employees_count", 0) > 0:
            recommendations.append(f"Норасмий ходимлар аниқланди: {factors['unregistered_employees_count']} та.")
        if abs(factors.get("discrepancy_percentage", 0)) > 20:
            recommendations.append(f"Тушум тафовути юқори: {factors['discrepancy_percentage']:.1f}%.")
        if score >= 70:
            recommendations.append("Юқори риск! Дарҳол инспекция тавсия этилади.")
        return recommendations