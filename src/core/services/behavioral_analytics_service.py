"""
Хулқ-атвор таҳлили сервиси
Behavioral Analytics модули
"""
from typing import List, Dict, Any
from datetime import datetime, timedelta
import numpy as np
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class BehavioralAnalyticsService:
    """Хулқ-атвор таҳлили сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.visit_times = {}  # track_id -> enter_time
        logger.info("Behavioral Analytics сервис инициализация қилинди")
    
    async def analyze_behavior(
        self,
        persons: List[Dict[str, Any]],
        timestamp: datetime
    ) -> Dict[str, Any]:
        """
        Хулқ-атворни таҳлил қилиш
        """
        try:
            # Мижозлар қолиш вақти
            stay_times = []
            queue_length = 0
            
            for person in persons:
                track_id = person.get("track_id")
                
                if track_id:
                    if track_id not in self.visit_times:
                        # Янги мижоз
                        self.visit_times[track_id] = timestamp
                    else:
                        # Мижоз қолиш вақти
                        enter_time = self.visit_times[track_id]
                        stay_duration = (timestamp - enter_time).total_seconds() / 60  # Минутларда
                        stay_times.append(stay_duration)
                
                # Навбат узунлиги (битта кадрдаги инсонлар сони)
                queue_length += 1
            
            # Статистика
            avg_stay_time = np.mean(stay_times) if stay_times else 0.0
            max_stay_time = np.max(stay_times) if stay_times else 0.0
            min_stay_time = np.min(stay_times) if stay_times else 0.0
            
            # Хизмат тезлиги (мижозлар сони / вақт)
            service_speed = len(persons) / 60.0 if persons else 0.0  # Мижоз/минута
            
            return {
                "timestamp": timestamp.isoformat(),
                "queue_length": queue_length,
                "average_stay_time": float(avg_stay_time),
                "max_stay_time": float(max_stay_time),
                "min_stay_time": float(min_stay_time),
                "service_speed": float(service_speed),
                "active_visits": len(self.visit_times)
            }
        
        except Exception as e:
            logger.error(f"Хулқ-атвор таҳлилида хатолик: {e}", exc_info=True)
            return {
                "timestamp": timestamp.isoformat(),
                "error": str(e)
            }
    
    async def get_peak_hours(
        self,
        location_id: int,
        date: datetime
    ) -> Dict[str, Any]:
        """
        Пик соатларни аниқлаш
        """
        # Бу метод базадан маълумот олиб ишлайди
        # Бу ерда содда логика
        return {
            "date": date.isoformat(),
            "peak_hours": [12, 13, 19, 20],  # Овқат вақтлари
            "low_hours": [2, 3, 4, 5]  # Кам мижоз соатлар
        }
    
    def clear_old_visits(self, max_age_minutes: int = 120):
        """Эски визитларни тозалаш"""
        current_time = datetime.utcnow()
        to_remove = []
        
        for track_id, enter_time in self.visit_times.items():
            age = (current_time - enter_time).total_seconds() / 60
            if age > max_age_minutes:
                to_remove.append(track_id)
        
        for track_id in to_remove:
            del self.visit_times[track_id]
