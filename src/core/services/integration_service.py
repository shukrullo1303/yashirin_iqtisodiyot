"""
Интеграция сервиси
Ташқи API билан ишлаш (Солиқ, ККТ, MyGov)
"""
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.integration import TaxIntegration, KKTIntegration
from app.models.analytics import Analytics

logger = logging.getLogger(__name__)


class IntegrationService:
    """Интеграция сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.tax_client = httpx.AsyncClient(
            base_url=settings.TAX_API_URL,
            headers={"Authorization": f"Bearer {settings.TAX_API_KEY}"},
            timeout=30.0
        )
        self.mygov_client = httpx.AsyncClient(
            base_url=settings.MYGOV_API_URL,
            headers={"Authorization": f"Bearer {settings.MYGOV_API_KEY}"},
            timeout=30.0
        )
        self.kkt_client = httpx.AsyncClient(
            base_url=settings.KKT_API_URL,
            headers={"Authorization": f"Bearer {settings.KKT_API_KEY}"},
            timeout=30.0
        )
        logger.info("Integration сервис инициализация қилинди")
    
    async def sync_tax_data(
        self,
        location_id: int,
        tax_id: str
    ) -> Dict[str, Any]:
        """
        Солиқ маълумотларини синхронлаш
        """
        try:
            db = SessionLocal()
            
            # Солиқ API дан маълумот олиш
            response = await self.tax_client.get(
                f"/api/tax/revenue/{tax_id}",
                params={
                    "start_date": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                    "end_date": datetime.utcnow().isoformat()
                }
            )
            
            if response.status_code != 200:
                raise ValueError(f"Солиқ API хатолиги: {response.status_code}")
            
            data = response.json()
            
            # Базага сақлаш
            integration = db.query(TaxIntegration).filter(
                TaxIntegration.location_id == location_id
            ).first()
            
            if not integration:
                integration = TaxIntegration(
                    location_id=location_id,
                    tax_id=tax_id
                )
                db.add(integration)
            
            integration.reported_revenue = data.get("reported_revenue", 0.0)
            integration.tax_paid = data.get("tax_paid", 0.0)
            integration.last_sync = datetime.utcnow()
            integration.sync_status = "success"
            
            db.commit()
            
            # Аналитикани янгилаш
            await self._update_analytics(location_id, integration.reported_revenue, db)
            
            db.close()
            
            return {
                "success": True,
                "location_id": location_id,
                "reported_revenue": integration.reported_revenue,
                "tax_paid": integration.tax_paid,
                "last_sync": integration.last_sync.isoformat()
            }
        
        except Exception as e:
            logger.error(f"Солиқ маълумотларини синхронлашда хатолик: {e}", exc_info=True)
            
            # Хатоликни сақлаш
            db = SessionLocal()
            try:
                integration = db.query(TaxIntegration).filter(
                    TaxIntegration.location_id == location_id
                ).first()
                
                if integration:
                    integration.sync_status = "error"
                    integration.error_message = str(e)
                    db.commit()
            finally:
                db.close()
            
            return {
                "success": False,
                "error": str(e)
            }
    
    async def sync_kkt_data(
        self,
        location_id: int,
        kkt_serial: str
    ) -> Dict[str, Any]:
        """
        ККТ маълумотларини синхронлаш
        """
        try:
            db = SessionLocal()
            
            # ККТ API дан маълумот олиш
            response = await self.kkt_client.get(
                f"/api/kkt/receipts/{kkt_serial}",
                params={
                    "start_date": (datetime.utcnow() - timedelta(days=7)).isoformat(),
                    "end_date": datetime.utcnow().isoformat()
                }
            )
            
            if response.status_code != 200:
                raise ValueError(f"ККТ API хатолиги: {response.status_code}")
            
            data = response.json()
            
            # Базага сақлаш
            integration = db.query(KKTIntegration).filter(
                KKTIntegration.location_id == location_id
            ).first()
            
            if not integration:
                integration = KKTIntegration(
                    location_id=location_id,
                    kkt_serial=kkt_serial
                )
                db.add(integration)
            
            integration.total_receipts = data.get("total_receipts", 0)
            integration.total_amount = data.get("total_amount", 0.0)
            integration.last_sync = datetime.utcnow()
            integration.sync_status = "success"
            
            db.commit()
            db.close()
            
            return {
                "success": True,
                "location_id": location_id,
                "total_receipts": integration.total_receipts,
                "total_amount": integration.total_amount,
                "last_sync": integration.last_sync.isoformat()
            }
        
        except Exception as e:
            logger.error(f"ККТ маълумотларини синхронлашда хатолик: {e}", exc_info=True)
            
            db = SessionLocal()
            try:
                integration = db.query(KKTIntegration).filter(
                    KKTIntegration.location_id == location_id
                ).first()
                
                if integration:
                    integration.sync_status = "error"
                    integration.error_message = str(e)
                    db.commit()
            finally:
                db.close()
            
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _update_analytics(
        self,
        location_id: int,
        reported_revenue: float,
        db: SessionLocal
    ):
        """Аналитикани янгилаш"""
        try:
            # Охирги аналитика
            analytics = db.query(Analytics).filter(
                Analytics.location_id == location_id
            ).order_by(Analytics.date.desc()).first()
            
            if analytics:
                analytics.reported_revenue = reported_revenue
                analytics.discrepancy = analytics.estimated_revenue - reported_revenue
                
                if reported_revenue > 0:
                    analytics.discrepancy_percentage = (
                        (analytics.discrepancy / reported_revenue) * 100
                    )
                
                db.commit()
        
        except Exception as e:
            logger.error(f"Аналитикани янгилашда хатолик: {e}")
