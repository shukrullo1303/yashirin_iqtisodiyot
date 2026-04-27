from src.core.models.base import *
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    """Фойдаланувчи модели"""
    
    # Роллар учун танловlar
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('tax_inspector', 'Soliq inspektori'),
        ('analyst', 'Analitik'),
        ('business_owner', 'Biznes egasi'),
        ('cafe_manager', 'Cafe menejer'),
        ('waiter', 'Ofitsiant'),
        ('kitchen', 'Oshpaz'),
    ]

    # Django-ning tayyor maydonlari (username, email, password, is_active, is_superuser, last_login) 
    # AbstractUser ichida allaqachon mavjud.
    
    full_name = models.CharField(max_length=255, verbose_name="Ф.И.Ш.")
    role = models.CharField(
        max_length=50,
        choices=ROLE_CHOICES,
        default='analyst',
        verbose_name="Roll"
    )
    location = models.ForeignKey(
        'core.Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff',
        verbose_name="Lokatsiya"
    )

    updated_at = models.DateTimeField(auto_now=True)
    # created_at o'rniga Django-ning tayyor date_joined maydonidan foydalanish ham mumkin

    class Meta:
        db_table = "users"
        verbose_name = "Фойдаланувчи"
        verbose_name_plural = "Фойдаланувчилар"

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"