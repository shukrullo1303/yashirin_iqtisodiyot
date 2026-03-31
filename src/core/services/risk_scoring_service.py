"""
Риск баҳолаш сервиси
Risk Scoring AI модули
"""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import numpy as np
import logging
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.employee import Employee
from app.models.analytics import Analytics, RiskScore
from app.models.customer import CustomerFlow

logger = logging.getLogger(__name__)


class RiskScoringService:
    """Риск баҳолаш сервиси"""
    
    def __init__(self):
        """Инициализация"""
        logger.info("Risk Scoring сервис инициализация қилинди")
    
    async def calculate_risk_score(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        """
        Риск баҳосини ҳисоблаш
        """
        try:
            db = SessionLocal()
            
            # Омилларни олиш
            factors = await self._collect_factors(location_id, date, db)
            
            # Риск баҳосини ҳисоблаш
            risk_score = self._calculate_score(factors)
            
            # Риск даражаси
            risk_level = self._get_risk_level(risk_score)
            
            # Базага сақлаш
            risk_record = RiskScore(
                location_id=location_id,
                date=date,
                risk_score=risk_score,
                risk_level=risk_level,
                factors=factors,
                unregistered_employees=factors.get("unregistered_employees_count", 0),
                revenue_discrepancy=factors.get("revenue_discrepancy", 0.0)
            )
            
            db.add(risk_record)
            db.commit()
            
            db.close()
            
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
            return {
                "error": str(e)
            }
    
    async def _collect_factors(
        self,
        location_id: int,
        date: datetime,
        db: Session
    ) -> Dict[str, Any]:
        """Риск омилларини тўплаш"""
        factors = {}
        
        # 1. Норасмий ходимлар
        unregistered_employees = db.query(Employee).filter(
            Employee.location_id == location_id,
            Employee.is_registered == False,
            Employee.is_active == True
        ).count()
        factors["unregistered_employees_count"] = unregistered_employees
        
        # 2. Тушум тафовути
        analytics = db.query(Analytics).filter(
            Analytics.location_id == location_id,
            Analytics.date >= date - timedelta(days=30)
        ).order_by(Analytics.date.desc()).first()
        
        if analytics:
            factors["revenue_discrepancy"] = analytics.discrepancy
            factors["discrepancy_percentage"] = analytics.discrepancy_percentage
        else:
            factors["revenue_discrepancy"] = 0.0
            factors["discrepancy_percentage"] = 0.0
        
        # 3. Мижозлар ва солиқ солиштириш
        customer_flow = db.query(CustomerFlow).filter(
            CustomerFlow.location_id == location_id,
            CustomerFlow.date >= date - timedelta(days=7)
        ).all()
        
        avg_customers = np.mean([cf.total_entered for cf in customer_flow]) if customer_flow else 0
        
        # Тахминий тушум
        estimated_revenue = avg_customers * 50000  # Ўртача чек
        
        # Хисоботдаги тушум
        reported_revenue = analytics.reported_revenue if analytics else 0
        
        if reported_revenue > 0:
            revenue_ratio = estimated_revenue / reported_revenue
            factors["revenue_ratio"] = revenue_ratio
        else:
            factors["revenue_ratio"] = 0.0
        
        # 4. Иш вақти тафовути
        # (бу ерда содда логика, аслда WorkLog дан олиш керак)
        factors["work_time_discrepancy"] = 0.0
        
        # 5. Касса операциялари
        # (ККТ интеграциясидан олиш керак)
        factors["kkt_operations_count"] = 0
        
        return factors
    
    def _calculate_score(self, factors: Dict[str, Any]) -> float:
        """Риск баҳосини ҳисоблаш"""
        score = 0.0
        
        # Норасмий ходимлар (макс 30 балл)
        unregistered = factors.get("unregistered_employees_count", 0)
        score += min(30, unregistered * 10)
        
        # Тушум тафовути (макс 40 балл)
        discrepancy_pct = abs(factors.get("discrepancy_percentage", 0))
        if discrepancy_pct > 50:
            score += 40
        elif discrepancy_pct > 30:
            score += 30
        elif discrepancy_pct > 20:
            score += 20
        elif discrepancy_pct > 10:
            score += 10
        
        # Тушум нисбати (макс 20 балл)
        revenue_ratio = factors.get("revenue_ratio", 1.0)
        if revenue_ratio < 0.5:
            score += 20
        elif revenue_ratio < 0.7:
            score += 15
        elif revenue_ratio < 0.9:
            score += 10
        
        # Иш вақти тафовути (макс 10 балл)
        work_time_disc = factors.get("work_time_discrepancy", 0)
        if work_time_disc > 50:
            score += 10
        elif work_time_disc > 30:
            score += 5
        
        return min(100, score)
    
    def _get_risk_level(self, score: float) -> str:
        """Риск даражасини аниқлаш"""
        if score >= 70:
            return "critical"
        elif score >= 50:
            return "high"
        elif score >= 30:
            return "medium"
        else:
            return "low"
    
    def _get_recommendations(
        self,
        score: float,
        factors: Dict[str, Any]
    ) -> List[str]:
        """Тавсиялар"""
        recommendations = []
        
        if factors.get("unregistered_employees_count", 0) > 0:
            recommendations.append(
                f"Норасмий ходимлар аниқланди: {factors['unregistered_employees_count']} та. "
                "Текширув тавсия этилади."
            )
        
        if abs(factors.get("discrepancy_percentage", 0)) > 20:
            recommendations.append(
                f"Тушум тафовути юқори: {factors['discrepancy_percentage']:.1f}%. "
                "Солиқ ҳисоботларини текшириш керак."
            )
        
        if score >= 70:
            recommendations.append(
                "Юқори риск аниқланди. Дарҳол текширув ўтқазиш тавсия этилади."
            )
        
        return recommendations
