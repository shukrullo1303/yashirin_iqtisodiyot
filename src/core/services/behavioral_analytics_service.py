import logging
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from django.utils import timezone
from django.core.cache import cache  # Redis билан ишлаш учун

# Моделларни импорт қилиш
from src.core.models.analytics import Analytics, PeakHour

logger = logging.getLogger(__name__)

class BehavioralAnalyticsService:
    """Хулқ-атвор ва навбатларни таҳлил қилиш сервиси"""
    
    def __init__(self):
        # track_id маълумотларини оператив хотирада эмас, Redis-да сақлаймиз
        self.cache_timeout = 7200  # 2 соат (секундларда)
        logger.info("Behavioral Analytics (Django + Redis) ишга тушди")

    async def analyze_behavior(
        self, 
        location_id: int, 
        persons: List[Dict[str, Any]], 
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Кадр ичидаги шахсларнинг ҳаракатини таҳлил қилиш"""
        if timestamp is None:
            timestamp = timezone.now()

        try:
            stay_times = []
            queue_count = len(persons)
            
            for person in persons:
                track_id = person.get("track_id")
                if not track_id:
                    continue

                # Redis-дан ушбу шахснинг келган вақтини текшириш
                cache_key = f"person_track_{location_id}_{track_id}"
                enter_time_str = cache.get(cache_key)

                if not enter_time_str:
                    # Янги шахс аниқланди
                    cache.set(cache_key, timestamp.isoformat(), self.cache_timeout)
                else:
                    # Аввалдан бор шахснинг қолиш вақтини ҳисоблаш
                    enter_time = datetime.fromisoformat(enter_time_str)
                    duration = (timestamp - enter_time).total_seconds() / 60  # Минутда
                    stay_times.append(duration)

            # Статистик кўрсаткичлар
            stats = {
                "avg_stay": float(np.mean(stay_times)) if stay_times else 0.0,
                "max_stay": float(np.max(stay_times)) if stay_times else 0.0,
                "service_speed": queue_count / 60.0 if queue_count > 0 else 0.0
            }

            # Маълумотларни базага (Analytics) сақлаш
            await self._save_to_db(location_id, queue_count, stats, timestamp)

            return {
                "location_id": location_id,
                "queue_length": queue_count,
                "metrics": stats,
                "timestamp": timestamp.isoformat()
            }

        except Exception as e:
            logger.error(f"Behavioral Analysis Error: {e}", exc_info=True)
            return {"error": str(e)}

    async def _save_to_db(self, location_id: int, queue: int, stats: dict, ts: datetime):
        """Ҳар бир таҳлил натижасини базага ёзиш"""
        # Бу ерда маълумотларни агрегация қилиб сақлаш тавсия этилади
        Analytics.objects.create(
            location_id=location_id,
            date=ts.date(),
            queue_length=queue,
            avg_stay_time=stats["avg_stay"],
            estimated_revenue=0.0  # Кейинги босқичда ҳисобланади
        )

    def get_peak_hours_report(self, location_id: int, days: int = 7) -> Dict[str, Any]:
        """Охирги N кунлик маълумот асосида пик соатларни аниқлаш"""
        start_date = timezone.now().date() - timedelta(days=days)
        
        # Django ORM орқали агрегация
        data = Analytics.objects.filter(
            location_id=location_id, 
            date__gte=start_date
        ).values('date__hour', 'queue_length')
        
        # Соатлар бўйича юкламани ҳисоблаш логикаси
        # ... (бу ерда соддалаштирилган)
        return {
            "location_id": location_id,
            "report_period": f"{days} days",
            "peak_hours": [11, 12, 13, 18, 19],  # Мисол учун
            "recommendation": "Овқатланиш вақтида кассирлар сонини оширинг"
        }