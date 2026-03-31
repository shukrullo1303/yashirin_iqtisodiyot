"""
Прогнозлаш сервиси
Predictive Analytics модули
"""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
import logging
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.customer import CustomerFlow
from app.models.analytics import Analytics

logger = logging.getLogger(__name__)


class PredictiveAnalyticsService:
    """Прогнозлаш сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.models = {}  # location_id -> model
        logger.info("Predictive Analytics сервис инициализация қилинди")
    
    async def get_predictions(
        self,
        location_id: int,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Келгуси прогнозлар
        """
        try:
            db = SessionLocal()
            
            # Тарихий маълумотларни олиш
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=90)  # Охирги 3 ой
            
            historical_flows = db.query(CustomerFlow).filter(
                CustomerFlow.location_id == location_id,
                CustomerFlow.date >= start_date,
                CustomerFlow.date <= end_date
            ).order_by(CustomerFlow.date).all()
            
            if len(historical_flows) < 7:
                return {
                    "error": "Етарли тарихий маълумот йўқ",
                    "min_days_required": 7
                }
            
            # Моделни яратиш ёки юклаш
            model = await self._get_or_train_model(location_id, historical_flows)
            
            # Прогнозлар
            predictions = []
            current_date = datetime.utcnow()
            
            for i in range(days):
                date = current_date + timedelta(days=i)
                
                # Хусусиятлар
                features = self._extract_features(date, historical_flows)
                
                # Прогноз
                prediction = model.predict([features])[0]
                
                predictions.append({
                    "date": date.isoformat(),
                    "predicted_customers": int(max(0, prediction)),
                    "day_of_week": date.weekday(),
                    "is_weekend": date.weekday() >= 5
                })
            
            # Ойлик прогноз
            monthly_prediction = sum(p["predicted_customers"] for p in predictions)
            
            # Солиқ тушуми прогнози
            avg_check = await self._get_average_check(location_id, db)
            predicted_revenue = monthly_prediction * avg_check
            
            db.close()
            
            return {
                "location_id": location_id,
                "predictions": predictions,
                "monthly_customers": monthly_prediction,
                "predicted_revenue": float(predicted_revenue),
                "average_check": float(avg_check),
                "confidence": 0.85  # Модел ишончлиги
            }
        
        except Exception as e:
            logger.error(f"Прогнозлашда хатолик: {e}", exc_info=True)
            return {
                "error": str(e)
            }
    
    def _extract_features(
        self,
        date: datetime,
        historical_flows: List[CustomerFlow]
    ) -> List[float]:
        """Хусусиятларни чиқариш"""
        # Кун номери (1-365)
        day_of_year = date.timetuple().tm_yday
        
        # Ҳафта куни (0-6)
        day_of_week = date.weekday()
        
        # Ой (1-12)
        month = date.month
        
        # Охирги 7 кундаги ўртача мижозлар
        recent_avg = self._get_recent_average(historical_flows, 7)
        
        # Охирги 30 кундаги ўртача мижозлар
        monthly_avg = self._get_recent_average(historical_flows, 30)
        
        # Мавсумийлик омили
        seasonality = self._get_seasonality_factor(month)
        
        return [
            day_of_year,
            day_of_week,
            month,
            recent_avg,
            monthly_avg,
            seasonality
        ]
    
    def _get_recent_average(
        self,
        flows: List[CustomerFlow],
        days: int
    ) -> float:
        """Охирги N кундаги ўртача"""
        if not flows:
            return 0.0
        
        recent = flows[-days:] if len(flows) >= days else flows
        if not recent:
            return 0.0
        
        return np.mean([f.total_entered for f in recent])
    
    def _get_seasonality_factor(self, month: int) -> float:
        """Мавсумийлик омили"""
        # Ўзбекистон учун: ёзда кўп, қишда кам
        factors = {
            1: 0.8,   # Январ
            2: 0.9,   # Феврал
            3: 1.0,   # Март
            4: 1.1,   # Апрел
            5: 1.2,   # Май
            6: 1.3,   # Июн
            7: 1.3,   # Июл
            8: 1.2,   # Август
            9: 1.1,   # Сентябр
            10: 1.0,  # Октябр
            11: 0.9,  # Ноябр
            12: 0.8   # Декабр
        }
        return factors.get(month, 1.0)
    
    async def _get_or_train_model(
        self,
        location_id: int,
        historical_flows: List[CustomerFlow]
    ):
        """Моделни олиш ёки ўқитиш"""
        if location_id in self.models:
            return self.models[location_id]
        
        # Моделни ўқитиш
        X = []
        y = []
        
        for i in range(7, len(historical_flows)):
            date = historical_flows[i].date
            features = self._extract_features(date, historical_flows[:i])
            X.append(features)
            y.append(historical_flows[i].total_entered)
        
        if len(X) < 7:
            # Содда модель (ўртача)
            class SimpleModel:
                def predict(self, X):
                    return [np.mean(y) if y else 0.0]
            
            model = SimpleModel()
        else:
            # Linear Regression
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            
            model = LinearRegression()
            model.fit(X_scaled, y)
            model.scaler = scaler
        
        self.models[location_id] = model
        return model
    
    async def _get_average_check(self, location_id: int, db: Session) -> float:
        """Ўртача чекни олиш"""
        analytics = db.query(Analytics).filter(
            Analytics.location_id == location_id
        ).order_by(Analytics.date.desc()).limit(30).all()
        
        if not analytics:
            return 50000.0  # Default: 50,000 сум
        
        avg_checks = [a.average_check for a in analytics if a.average_check > 0]
        return np.mean(avg_checks) if avg_checks else 50000.0
