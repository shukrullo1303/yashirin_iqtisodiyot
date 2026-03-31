
from src.core.models.base import *

class Analytics(BaseModel):
    """Аналитика маълумотлари"""
    # Django-da 'id' avtomatik yaratiladi, shuning uchun yozish shart emas
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='analytics',
        verbose_name="Локация"
    )
    date = models.DateTimeField(db_index=True, verbose_name="Сана")
    real_customers = models.IntegerField(default=0, verbose_name="Реал мижозлар")
    reported_revenue = models.FloatField(default=0.0, verbose_name="Хисоботдаги тушум")
    estimated_revenue = models.FloatField(default=0.0, verbose_name="Тахминий тушум")
    average_check = models.FloatField(default=0.0, verbose_name="Ўртача чек")
    discrepancy = models.FloatField(default=0.0, verbose_name="Тафовут")
    discrepancy_percentage = models.FloatField(default=0.0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "analytics"
        verbose_name = "Аналитика"
        verbose_name_plural = "Аналитикалар"


class RiskScore(BaseModel):
    """Риск баҳоси"""
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='risk_scores',
        verbose_name="Локация"
    )
    date = models.DateTimeField(db_index=True)
    risk_score = models.FloatField(default=0.0)  # 0-100
    risk_level = models.CharField(max_length=50, default="low")  # low, medium, high, critical
    factors = models.JSONField(null=True, blank=True)  # Риск омиллари
    unregistered_employees = models.IntegerField(default=0)
    revenue_discrepancy = models.FloatField(default=0.0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "risk_scores"
        verbose_name = "Риск баҳоси"


class Heatmap(BaseModel):
    """Юклама харитаси"""
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='heatmaps',
        verbose_name="Локация"
    )
    date = models.DateTimeField(db_index=True)
    hour = models.IntegerField()  # 0-23
    heatmap_data = models.JSONField()  # Grid маълумотлари
    max_intensity = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "heatmaps"
        verbose_name = "Юклама харитаси"