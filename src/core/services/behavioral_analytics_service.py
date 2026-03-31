import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
from django.core.cache import cache
from django.utils import timezone

from src.core.models.analytics import Analytics

logger = logging.getLogger(__name__)


class BehavioralAnalyticsService:
    """Navbat va odam oqimi bo‘yicha sodda behavior analytics servisi."""

    def __init__(self):
        self.cache_timeout = 7200
        logger.info("BehavioralAnalyticsService loaded")

    async def analyze_behavior(
        self,
        location_id: int,
        persons: List[Dict[str, Any]],
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        return self.analyze_behavior_sync(location_id, persons, timestamp)

    def analyze_behavior_sync(
        self,
        location_id: int,
        persons: List[Dict[str, Any]],
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        if timestamp is None:
            timestamp = timezone.now()

        try:
            stay_times: List[float] = []
            queue_count = len(persons)

            for index, person in enumerate(persons):
                track_id = person.get("track_id") or f"anon-{index}"
                cache_key = f"person_track_{location_id}_{track_id}"
                enter_time_str = cache.get(cache_key)

                if not enter_time_str:
                    cache.set(cache_key, timestamp.isoformat(), self.cache_timeout)
                    continue

                enter_time = datetime.fromisoformat(enter_time_str)
                duration = max(0.0, (timestamp - enter_time).total_seconds() / 60)
                stay_times.append(duration)

            stats = {
                "avg_stay": float(np.mean(stay_times)) if stay_times else 0.0,
                "max_stay": float(np.max(stay_times)) if stay_times else 0.0,
                "service_speed": round(queue_count / 60.0, 3) if queue_count > 0 else 0.0,
            }

            self._save_snapshot(location_id, queue_count, stats, timestamp)

            return {
                "location_id": location_id,
                "queue_length": queue_count,
                "metrics": stats,
                "timestamp": timestamp.isoformat(),
            }
        except Exception as exc:
            logger.error("Behavior analysis error: %s", exc, exc_info=True)
            return {"error": str(exc)}

    def _save_snapshot(self, location_id: int, queue: int, stats: Dict[str, float], ts: datetime):
        """Mavjud Analytics modeliga mos holda qisqa snapshot saqlaydi."""
        record_time = ts.replace(second=0, microsecond=0)
        defaults = {
            "real_customers": queue,
            "reported_revenue": 0.0,
            "estimated_revenue": float(queue * 50000),
            "average_check": 50000.0 if queue else 0.0,
            "discrepancy": 0.0,
            "discrepancy_percentage": 0.0,
        }

        analytics, created = Analytics.objects.get_or_create(
            location_id=location_id,
            date=record_time,
            defaults=defaults,
        )
        if not created:
            analytics.real_customers = max(analytics.real_customers, queue)
            analytics.estimated_revenue = max(analytics.estimated_revenue, defaults["estimated_revenue"])
            if not analytics.average_check and queue:
                analytics.average_check = defaults["average_check"]
            analytics.save(update_fields=["real_customers", "estimated_revenue", "average_check", "updated_at"])

    def get_peak_hours_report(self, location_id: int, days: int = 7) -> Dict[str, Any]:
        """Oxirgi kunlar bo‘yicha peak hour hisobotini qaytaradi."""
        start_date = timezone.now() - timedelta(days=days)
        hourly_data = Analytics.objects.filter(
            location_id=location_id,
            date__gte=start_date,
        ).values("date__hour", "real_customers")

        hour_totals: Dict[int, int] = {}
        for row in hourly_data:
            hour = row.get("date__hour")
            if hour is None:
                continue
            hour_totals[hour] = hour_totals.get(hour, 0) + int(row.get("real_customers") or 0)

        peak_hours = [hour for hour, _ in sorted(hour_totals.items(), key=lambda item: item[1], reverse=True)[:5]]

        return {
            "location_id": location_id,
            "report_period": f"{days} days",
            "peak_hours": peak_hours,
            "recommendation": "Pik soatlarda ko‘proq xodim ajrating.",
        }