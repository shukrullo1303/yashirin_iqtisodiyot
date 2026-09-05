from src.core.models.base import *

class TaxIntegration(BaseModel):
    """Солиқ интеграцияси"""
    # Sinxronizatsiya holatlari uchun tanlovlar
    SYNC_STATUS_CHOICES = [
        ('pending', 'Kutilmoqda'),
        ('success', 'Muvaffaqiyatli'),
        ('error', 'Xatolik'),
    ]

    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='tax_integrations',
        verbose_name="Локация"
    )
    tax_id = models.CharField(max_length=50, verbose_name="STIR (ИНН) / Soliq ID")
    last_sync = models.DateTimeField(null=True, blank=True, verbose_name="Oxirgi sinxronizatsiya")
    reported_revenue = models.FloatField(default=0.0, verbose_name="Ҳисоботдаги тушум")
    tax_paid = models.FloatField(default=0.0, verbose_name="Тўланган солиқ")
    REPORT_PERIOD_CHOICES = [
        ("daily", "Kunlik"),
        ("monthly", "Oylik"),
    ]
    report_period = models.DateField(null=True, blank=True, db_index=True, verbose_name="Hisobot sanasi")
    report_period_type = models.CharField(max_length=10, choices=REPORT_PERIOD_CHOICES, default="daily", verbose_name="Hisobot davri")
    entered_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='entered_tax_reports', verbose_name="Kiritgan inspektor"
    )
    is_manual = models.BooleanField(default=False, verbose_name="Qo'lda kiritilgan")
    sync_status = models.CharField(
        max_length=50, 
        choices=SYNC_STATUS_CHOICES, 
        default="pending",
        verbose_name="Ҳолат"
    )
    error_message = models.TextField(null=True, blank=True, verbose_name="Xatolik xabari")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tax_integrations"
        verbose_name = "Солиқ интеграцияси"
        verbose_name_plural = "Солиқ интеграциялари"


class KKTIntegration(models.Model):
    """ККТ (онлайн касса) интеграцияси"""
    SYNC_STATUS_CHOICES = [
        ('pending', 'Kutilmoqda'),
        ('success', 'Muvaffaqiyatli'),
        ('error', 'Xatolik'),
    ]

    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='kkt_integrations',
        verbose_name="Локация"
    )
    kkt_serial = models.CharField(max_length=100, verbose_name="ККТ серия рақами")
    kkt_number = models.CharField(max_length=100, null=True, blank=True, verbose_name="ККТ рақами")
    last_sync = models.DateTimeField(null=True, blank=True, verbose_name="Oxirgi sinxronizatsiya")
    total_receipts = models.IntegerField(default=0, verbose_name="Чекlar soni")
    total_amount = models.FloatField(default=0.0, verbose_name="Umumiy summa")
    sync_status = models.CharField(
        max_length=50, 
        choices=SYNC_STATUS_CHOICES, 
        default="pending",
        verbose_name="Ҳолат"
    )
    error_message = models.TextField(null=True, blank=True, verbose_name="Xatolik xabari")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "kkt_integrations"
        verbose_name = "ККТ интеграцияси"
        verbose_name_plural = "ККТ интеграциялари"
