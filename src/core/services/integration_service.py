import httpx
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.db import transaction

# Django моделларини импорт қилиш
from src.core.models.integration import TaxIntegration, KKTIntegration
from src.core.models.analytics import Analytics

logger = logging.getLogger(__name__)

class IntegrationService:
    """Интеграция сервиси (Django версия)"""
    
    def __init__(self):
        """HTTP клиентларни инициализация қилиш"""
        tax_key = getattr(settings, 'TAX_API_KEY', '')
        tax_url = getattr(settings, 'TAX_API_URL', 'http://localhost')
        mygov_key = getattr(settings, 'MYGOV_API_KEY', '')
        mygov_url = getattr(settings, 'MYGOV_API_URL', 'http://localhost')
        kkt_key = getattr(settings, 'KKT_API_KEY', '')
        kkt_url = getattr(settings, 'KKT_API_URL', 'http://localhost')

        self.tax_client = httpx.AsyncClient(
            base_url=tax_url, headers={"Authorization": f"Bearer {tax_key}"}, timeout=30.0
        )
        self.mygov_client = httpx.AsyncClient(
            base_url=mygov_url, headers={"Authorization": f"Bearer {mygov_key}"}, timeout=30.0
        )
        self.kkt_client = httpx.AsyncClient(
            base_url=kkt_url, headers={"Authorization": f"Bearer {kkt_key}"}, timeout=30.0
        )
        logger.info("Integration сервис (Django) муваффақиятли ишга тушди")

    async def sync_tax_data(self, location_id: int, tax_id: str) -> Dict[str, Any]:
        """Солиқ маълумотларини синхронлаш"""
        try:
            # API дан маълумот олиш
            params = {
                "start_date": (timezone.now() - timedelta(days=30)).date().isoformat(),
                "end_date": timezone.now().date().isoformat()
            }
            
            response = await self.tax_client.get(f"/api/tax/revenue/{tax_id}", params=params)
            
            if response.status_code != 200:
                raise ValueError(f"Солиқ API хатолиги: {response.status_code}")
            
            data = response.json()

            # Django ORM орқали маълумотларни янгилаш (Атомик транзакция)
            with transaction.atomic():
                integration, created = TaxIntegration.objects.update_or_create(
                    location_id=location_id,
                    defaults={
                        'tax_id': tax_id,
                        'reported_revenue': data.get("reported_revenue", 0.0),
                        'tax_paid': data.get("tax_paid", 0.0),
                        'last_sync': timezone.now(),
                        'sync_status': "success",
                        'error_message': None
                    }
                )
                
                # Аналитикани янгилаш
                await self._update_analytics(location_id, integration.reported_revenue)

            return {
                "success": True,
                "reported_revenue": integration.reported_revenue,
                "tax_paid": integration.tax_paid,
                "last_sync": integration.last_sync.isoformat()
            }

        except Exception as e:
            logger.error(f"Sync Tax Error: {e}", exc_info=True)
            # Хатолик ҳолатини базада қайд этиш
            TaxIntegration.objects.filter(location_id=location_id).update(
                sync_status="error",
                error_message=str(e)
            )
            return {"success": False, "error": str(e)}

    async def sync_kkt_data(self, location_id: int, kkt_serial: str) -> Dict[str, Any]:
        """ККТ (Чеклар) маълумотларини синхронлаш"""
        try:
            params = {
                "start_date": (timezone.now() - timedelta(days=7)).date().isoformat(),
                "end_date": timezone.now().date().isoformat()
            }
            
            response = await self.kkt_client.get(f"/api/kkt/receipts/{kkt_serial}", params=params)
            
            if response.status_code != 200:
                raise ValueError(f"ККТ API хатолиги: {response.status_code}")
            
            data = response.json()

            with transaction.atomic():
                integration, _ = KKTIntegration.objects.update_or_create(
                    location_id=location_id,
                    defaults={
                        'kkt_serial': kkt_serial,
                        'total_receipts': data.get("total_receipts", 0),
                        'total_amount': data.get("total_amount", 0.0),
                        'last_sync': timezone.now(),
                        'sync_status': "success"
                    }
                )

            return {
                "success": True,
                "total_receipts": integration.total_receipts,
                "total_amount": integration.total_amount
            }

        except Exception as e:
            logger.error(f"Sync KKT Error: {e}")
            KKTIntegration.objects.filter(location_id=location_id).update(
                sync_status="error", error_message=str(e)
            )
            return {"success": False, "error": str(e)}

    async def _update_analytics(self, location_id: int, reported_revenue: float):
        """Аналитикадаги тафовутни (discrepancy) қайта ҳисоблаш"""
        # Энг охирги аналитика ёзувини олиш
        latest_analytics = Analytics.objects.filter(
            location_id=location_id
        ).order_by('-date').first()
        
        if latest_analytics:
            latest_analytics.reported_revenue = reported_revenue
            # Тафовут: Биз тахмин қилган тушум - Солиқдаги расмий тушум
            latest_analytics.discrepancy = latest_analytics.estimated_revenue - reported_revenue
            
            if reported_revenue > 0:
                latest_analytics.discrepancy_percentage = (
                    (latest_analytics.discrepancy / reported_revenue) * 100
                )
            latest_analytics.save()

    async def close_connections(self):
        """Клиентларни ёпиш (Ресурсларни бўшатиш)"""
        await self.tax_client.aclose()
        await self.mygov_client.aclose()
        await self.kkt_client.aclose()