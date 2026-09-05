from django.conf import settings
from src.core.models.base import *

class Location(BaseModel):
    """Локация модели"""
    
    # Локация турлари учун танловлар (Enum o'rniga)
    LOCATION_TYPE_CHOICES = [
        ('cafe', 'Kafe'),
        ('restaurant', 'Restoran'),
        ('tea_house', 'Choyxona'),
        ('hair_salon', 'Sartaroshxona'),
        ('car_wash', 'Avtoyuvish'),
        ('service_center', 'Xizmat koʻrsatish markazi'),
        ('household_service', 'Maishiy xizmat'),
        ('other', 'Boshqa'),
    ]

    name = models.CharField(max_length=255, verbose_name="Nomi")
    address = models.CharField(max_length=500, verbose_name="Manzili")
    location_type = models.CharField(
        max_length=50, 
        choices=LOCATION_TYPE_CHOICES, 
        verbose_name="Turi"
    )
    latitude = models.FloatField(null=True, blank=True, verbose_name="Kenglik (Lat)")
    longitude = models.FloatField(null=True, blank=True, verbose_name="Uzunlik (Long)")
    tax_id = models.CharField(max_length=50, unique=True, null=True, blank=True, verbose_name="STIR (ИНН)")
    
    # Ro'yxatdan o'tganligi
    is_registered = models.BooleanField(default=False, verbose_name="Ro'yxatdan o'tganmi")
    
    # Foydalanuvchi (Egasi) bilan bog'liqlik
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='locations',
        verbose_name="Egasi"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Aktivmi")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "locations"
        verbose_name = "Локация"
        verbose_name_plural = "Локациялар"

    def __str__(self):
        return f"{self.name} ({self.get_location_type_display()})"


class Camera(BaseModel):
    """Камера модели"""
    
    CAMERA_TYPE_CHOICES = [
        ('entrance', 'Kirish'),
        ('exit', 'Chiqish'),
    ]

    location = models.ForeignKey(
        Location, 
        on_delete=models.CASCADE, 
        related_name='cameras',
        verbose_name="Локация"
    )
    name = models.CharField(max_length=255, verbose_name="Kamera nomi")
    ip_address = models.CharField(max_length=50, verbose_name="IP manzil")
    port = models.IntegerField(default=80, verbose_name="Port")
    username = models.CharField(max_length=100, null=True, blank=True, verbose_name="Login")
    password = models.CharField(max_length=255, null=True, blank=True, verbose_name="Parol") # Shifrlangan holda saqlang
    onvif_url = models.CharField(max_length=500, null=True, blank=True, verbose_name="ONVIF URL")
    
    camera_type = models.CharField(
        max_length=50, 
        choices=CAMERA_TYPE_CHOICES, 
        default="entrance",
        verbose_name="Kamera turi"
    )
    
    is_active = models.BooleanField(default=True, verbose_name="Aktivmi")
    stream_url = models.CharField(max_length=500, null=True, blank=True, verbose_name="RTSP/Stream URL")
    resolution = models.CharField(max_length=50, default="1920x1080", verbose_name="Ruxsat (Resolution)")
    fps = models.IntegerField(default=30, verbose_name="FPS")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cameras"
        verbose_name = "Камера"
        verbose_name_plural = "Камералар"

    def __str__(self):
        return f"{self.name} - {self.location.name}"


class CameraDowntime(BaseModel):
    """Kamera nofaol qoldirilgan vaqt oralig'i."""
    camera = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name='downtimes')
    started_at = models.DateTimeField(db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True, default='Nofaol holat')

    class Meta:
        db_table = 'camera_downtimes'
        ordering = ['-started_at']

    @property
    def duration_minutes(self):
        end = self.ended_at or timezone.now()
        return max(0, (end - self.started_at).total_seconds() / 60)


class NvrGateway(BaseModel):
    """Hududdagi NVR yoki AI gatewayning markaziy boshqaruv kartasi."""
    STATUS_CHOICES = [("online", "Online"), ("offline", "Offline"), ("warning", "Ogohlantirish")]
    location = models.OneToOneField(Location, on_delete=models.CASCADE, related_name="nvr_gateway")
    name = models.CharField(max_length=255)
    host = models.CharField(max_length=255, help_text="VPN ichki IP yoki hostname")
    channel_count = models.PositiveIntegerField(default=8)
    vpn_connected = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="offline")
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "nvr_gateways"
        ordering = ["location__name"]
