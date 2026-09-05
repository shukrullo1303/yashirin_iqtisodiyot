from src.core.models.base import *
import uuid


class VisitorRetentionSetting(models.Model):
    """Mijoz biometrik ma'lumotlarini saqlashning boshqariladigan muddati."""
    retention_hours = models.PositiveIntegerField(default=24)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "visitor_retention_settings"


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


def make_visitor_id():
    """Tashrifga beriladigan, shaxsni oshkor qilmaydigan vaqtinchalik ID."""
    return f"V-{uuid.uuid4().hex[:12].upper()}"


class VisitorSession(BaseModel):
    """Kirish va chiqish kamerasi orasidagi bitta mijoz tashrifi.

    ``face_embedding`` va rasm yo'llari faqat yuzni chiqishda qayta topish uchun
    saqlanadi. Retention worker ularni 24 soatdan so'ng avtomatik tozalaydi.
    """

    STATUS_CHOICES = [
        ("inside", "Ichkarida"),
        ("completed", "Chiqib ketgan"),
    ]

    visitor_id = models.CharField(
        max_length=20, unique=True, default=make_visitor_id, editable=False,
        verbose_name="Visitor ID",
    )
    location = models.ForeignKey(
        "Location", on_delete=models.CASCADE, related_name="visitor_sessions",
        verbose_name="Lokatsiya",
    )
    entry_camera = models.ForeignKey(
        "Camera", on_delete=models.SET_NULL, null=True, related_name="entry_sessions",
        verbose_name="Kirish kamerasi",
    )
    exit_camera = models.ForeignKey(
        "Camera", on_delete=models.SET_NULL, null=True, blank=True, related_name="exit_sessions",
        verbose_name="Chiqish kamerasi",
    )
    entered_at = models.DateTimeField(db_index=True, verbose_name="Kirish vaqti")
    exited_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name="Chiqish vaqti")
    last_seen_at = models.DateTimeField(verbose_name="Oxirgi ko'rilgan vaqt")
    stay_duration = models.FloatField(null=True, blank=True, verbose_name="Davomiyligi (minut)")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="inside")
    is_long_stay = models.BooleanField(default=False, verbose_name="Uzoq qolgan")
    is_anonymous = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Yuzi aniqlanmagan anonim tashrif",
    )
    is_employee = models.BooleanField(default=False, verbose_name="Xodimmi")
    employee = models.ForeignKey(
        "Employee", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="visitor_sessions", verbose_name="Xodim",
    )

    # Encrypted embedding; API hech qachon bu maydonni qaytarmaydi.
    face_embedding = models.TextField(blank=True, default="", verbose_name="Shifrlangan yuz vektori")
    entry_image_path = models.CharField(max_length=500, blank=True, default="", verbose_name="Kirish rasmi")
    exit_image_path = models.CharField(max_length=500, blank=True, default="", verbose_name="Chiqish rasmi")
    entry_body_image_path = models.CharField(max_length=500, blank=True, default="", verbose_name="Kirishdagi tashqi ko‘rinish")
    exit_body_image_path = models.CharField(max_length=500, blank=True, default="", verbose_name="Chiqishdagi tashqi ko‘rinish")
    biometric_purged_at = models.DateTimeField(null=True, blank=True, verbose_name="Biometrik ma'lumot o'chirilgan vaqt")

    class Meta:
        db_table = "visitor_sessions"
        ordering = ["-entered_at"]
        indexes = [models.Index(fields=["location", "status", "entered_at"])]
        verbose_name = "Mijoz tashrifi"
        verbose_name_plural = "Mijoz tashriflari"

    def __str__(self):
        return f"{self.visitor_id} ({self.location_id})"


class PotentialEmployee(models.Model):
    """Uzoq qolgan tashrifdan soliq inspektori ko'rib chiqadigan nomzod."""
    STATUS_CHOICES = [("pending", "Kutilmoqda"), ("registered", "Ro'yxatdan o'tgan")]
    visitor_session = models.OneToOneField(VisitorSession, on_delete=models.CASCADE, related_name="potential_employee")
    location = models.ForeignKey("Location", on_delete=models.CASCADE, related_name="potential_employees")
    detected_at = models.DateTimeField(auto_now_add=True)
    duration_minutes = models.FloatField()
    face_embedding = models.TextField(blank=True, default="")
    image_path = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pending")
    employee = models.ForeignKey("Employee", on_delete=models.SET_NULL, null=True, blank=True, related_name="potential_employee_alerts")

    class Meta:
        db_table = "potential_employees"
        ordering = ["-detected_at"]

    def __str__(self):
        return f"Potential {self.visitor_session.visitor_id}"


class VisitorEvent(models.Model):
    """Bir Visitor ID ning 24 soat ichidagi barcha kirish/chiqish voqealari."""
    EVENT_CHOICES = [("entry", "Kirdi"), ("exit", "Chiqdi")]
    visitor_session = models.ForeignKey(VisitorSession, on_delete=models.CASCADE, related_name="events")
    camera = models.ForeignKey("Camera", on_delete=models.SET_NULL, null=True)
    event_type = models.CharField(max_length=8, choices=EVENT_CHOICES)
    occurred_at = models.DateTimeField(db_index=True)
    image_path = models.CharField(max_length=500, blank=True, default="")
    is_manual = models.BooleanField(default=False, verbose_name="Admin qo‘lda qayd qilgan")

    class Meta:
        db_table = "visitor_events"
        ordering = ["occurred_at"]
