from src.core.models.base import *


class CustomerFlow(BaseModel):
    """Мижозлар оқими (кунлик статистика)"""
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='customer_flows',
        verbose_name="Локация"
    )
    date = models.DateTimeField(db_index=True, verbose_name="Сана")
    total_entered = models.IntegerField(default=0, verbose_name="Кирганлар сони")
    total_exited = models.IntegerField(default=0, verbose_name="Чиққанлар сони")
    peak_hour = models.IntegerField(null=True, blank=True, verbose_name="Энг кўп мижоз соати")
    average_stay_time = models.FloatField(null=True, blank=True, verbose_name="Ўртача қолиш вақти (мин)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customer_flows"
        verbose_name = "Мижозлар оқими"
        verbose_name_plural = "Мижозлар оқими"


class CustomerVisit(BaseModel):
    """Битта мижоз ташрифи"""
    flow = models.ForeignKey(
        CustomerFlow, 
        on_delete=models.CASCADE, 
        related_name='visits',
        verbose_name="Оқим"
    )
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='customer_visits',
        verbose_name="Локация"
    )
    entered_at = models.DateTimeField(db_index=True, verbose_name="Кирган вақти")
    exited_at = models.DateTimeField(null=True, blank=True, verbose_name="Чиққан вақти")
    stay_duration = models.FloatField(null=True, blank=True, verbose_name="Қолиш давомийлиги (мин)")
    track_id = models.CharField(max_length=100, null=True, blank=True, verbose_name="Tracking ID")
    is_employee = models.BooleanField(default=False, verbose_name="Ходимми?")
    
    # Бу ерда 'Employee' модели мавжуд деб ҳисоблаймиз
    employee = models.ForeignKey(
        'Employee', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='visits',
        verbose_name="Ходим"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customer_visits"
        verbose_name = "Мижоз ташрифи"
        verbose_name_plural = "Мижоз ташрифлари"


class TrackedCustomer(models.Model):
    """Yuz signaturasi bo'yicha kuzatilgan mijoz (24 soat+)."""
    signature = models.CharField(max_length=64, db_index=True, verbose_name="Yuz signaturasi")
    location = models.ForeignKey(
        'Location',
        on_delete=models.CASCADE,
        related_name='tracked_customers',
        verbose_name="Lokatsiya",
    )
    date_str = models.CharField(max_length=10, db_index=True, verbose_name="Sana (YYYY-MM-DD)")
    first_seen = models.DateTimeField(verbose_name="Birinchi ko'ringan vaqt")
    last_seen = models.DateTimeField(verbose_name="Oxirgi ko'ringan vaqt")
    visit_count = models.PositiveIntegerField(default=1, verbose_name="Ko'ringan marta")

    class Meta:
        db_table = "tracked_customers"
        unique_together = [("signature", "location", "date_str")]
        verbose_name = "Kuzatilgan mijoz"
        verbose_name_plural = "Kuzatilgan mijozlar"

    def __str__(self):
        return f"{self.signature[:8]} @ {self.location_id} {self.date_str}"