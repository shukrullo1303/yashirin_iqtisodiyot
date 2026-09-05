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
    # Soliq inspektori bir vaqtning o'zida bir nechta biriktirilgan
    # lokatsiyani tekshirishi mumkin. Bu egalik emas, faqat ko'rish doirasi.
    assigned_locations = models.ManyToManyField(
        'core.Location', blank=True, related_name='assigned_inspectors',
        verbose_name="Biriktirilgan tekshiruv lokatsiyalari"
    )

    updated_at = models.DateTimeField(auto_now=True)
    # Public registration creates a pending account.  Only an administrator can
    # activate it after reviewing the request.
    is_approved = models.BooleanField(default=False, verbose_name="Tasdiqlangan")
    # created_at o'rniga Django-ning tayyor date_joined maydonidan foydalanish ham mumkin

    class Meta:
        db_table = "users"
        verbose_name = "Фойдаланувчи"
        verbose_name_plural = "Фойдаланувчилар"

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
