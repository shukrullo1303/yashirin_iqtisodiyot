import logging
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Avg

# ML kutubxonalari
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

# Django modellarini import qilish
from src.core.models.customer import CustomerFlow
from src.core.models.analytics import Analytics

logger = logging.getLogger(__name__)

class PredictiveAnalyticsService:
    """Прогнозлаш сервиси (Django версия)"""
    
    def __init__(self):
        """Инициализация"""
        self.models = {}  # location_id -> model (Xotirada kesh qilingan modellar)
        logger.info("Predictive Analytics сервис (Django) инициализация қилинди")
    
    async def get_predictions(
        self,
        location_id: int,
        days: int = 30
    ) -> Dict[str, Any]:
        """Келгуси прогнозлар"""
        try:
            # 1. Тарихий маълумотларни олиш (Oxirgi 90 kun)
            end_date = timezone.now()
            start_date = end_date - timedelta(days=90)
            
            # Django ORM yordamida ma'lumotlarni list ko'rinishida olish
            historical_flows = list(CustomerFlow.objects.filter(
                location_id=location_id,
                date__range=[start_date.date(), end_date.date()]
            ).order_by('date'))
            
            if len(historical_flows) < 7:
                return {
                    "error": "Етарли тарихий маълумот йўқ",
                    "min_days_required": 7,
                    "current_days": len(historical_flows)
                }
            
            # 2. Моделни яратиш ёки юклаш
            model = await self._get_or_train_model(location_id, historical_flows)
            
            # 3. Прогнозлар яратиш
            predictions = []
            current_date = timezone.now()
            
            for i in range(days):
                target_date = current_date + timedelta(days=i)
                
                # Хусусиятларни (features) тайёрлаш
                features = self._extract_features(target_date, historical_flows)
                
                # Bashorat (Scaling bilan)
                if hasattr(model, 'scaler'):
                    features_scaled = model.scaler.transform([features])
                    prediction = model.predict(features_scaled)[0]
                else:
                    prediction = model.predict([features])[0]
                
                predictions.append({
                    "date": target_date.date().isoformat(),
                    "predicted_customers": int(max(0, prediction)),
                    "day_of_week": target_date.weekday(),
                    "is_weekend": target_date.weekday() >= 5
                })
            
            # 4. Жами прогноз ва тушум
            monthly_total_customers = sum(p["predicted_customers"] for p in predictions)
            avg_check = await self._get_average_check(location_id)
            predicted_revenue = monthly_total_customers * avg_check
            
            return {
                "location_id": location_id,
                "predictions": predictions,
                "monthly_customers": monthly_total_customers,
                "predicted_revenue": float(predicted_revenue),
                "average_check": float(avg_check),
                "confidence": 0.85
            }
        
        except Exception as e:
            logger.error(f"Прогнозлашда хатолик: {e}", exc_info=True)
            return {"error": str(e)}

    def _extract_features(self, date: datetime, historical_flows: List[CustomerFlow]) -> List[float]:
        """ML modeli uchun featurelarni chiqarish"""
        day_of_year = date.timetuple().tm_yday
        day_of_week = date.weekday()
        month = date.month
        
        # Oxirgi 7 va 30 kundagi o'rtacha oqim (Django Queryset emas, list ustida np.mean)
        recent_values = [f.total_entered for f in historical_flows]
        
        recent_avg = np.mean(recent_values[-7:]) if recent_values else 0.0
        monthly_avg = np.mean(recent_values[-30:]) if recent_values else 0.0
        seasonality = self._get_seasonality_factor(month)
        
        return [day_of_year, day_of_week, month, recent_avg, monthly_avg, seasonality]

    def _get_seasonality_factor(self, month: int) -> float:
        """O'zbekiston bozori uchun mavsumiylik koeffitsiyenti"""
        factors = {
            1: 0.8, 2: 0.9, 3: 1.0, 4: 1.1, 5: 1.2, 6: 1.3,
            7: 1.3, 8: 1.2, 9: 1.1, 10: 1.0, 11: 0.9, 12: 0.8
        }
        return factors.get(month, 1.0)

    async def _get_or_train_model(self, location_id: int, historical_flows: List[CustomerFlow]):
        """Lokatsiya uchun modelni o'qitish"""
        if location_id in self.models:
            return self.models[location_id]
        
        X = []
        y = []
        
        # Training set tayyorlash (Kamida 7 kunlik siljish bilan)
        for i in range(7, len(historical_flows)):
            date = historical_flows[i].date
            # convert date to datetime for extraction
            dt_obj = datetime.combine(date, datetime.min.time())
            features = self._extract_features(dt_obj, historical_flows[:i])
            X.append(features)
            y.append(historical_flows[i].total_entered)
        
        if len(X) < 7:
            # Oddiy o'rtacha qiymat qaytaruvchi model
            class SimpleModel:
                def predict(self, features_list):
                    return [np.mean(y) if y else 0.0]
            model = SimpleModel()
        else:
            # Linear Regression modeli
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            
            model = LinearRegression()
            model.fit(X_scaled, y)
            model.scaler = scaler # Scaler'ni model ichiga biriktirib qo'yamiz
            
        self.models[location_id] = model
        return model

    async def _get_average_check(self, location_id: int) -> float:
        """Django ORM orqali o'rtacha chekni hisoblash"""
        avg_val = Analytics.objects.filter(
            location_id=location_id
        ).order_by('-date')[:30].aggregate(Avg('average_check'))['average_check__avg']
        
        return float(avg_val) if avg_val else 50000.0