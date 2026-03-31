from src.core.models.base import *


class Employee(BaseModel):
    """Ходим модели"""
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='employees',
        verbose_name="Локация"
    )
    full_name = models.CharField(max_length=255, verbose_name="Ф.И.Ш.")
    position = models.CharField(max_length=100, null=True, blank=True, verbose_name="Лавозими")
    phone = models.CharField(max_length=50, null=True, blank=True, verbose_name="Телефон")
    email = models.EmailField(max_length=255, null=True, blank=True, verbose_name="Email")
    passport_number = models.CharField(max_length=50, null=True, blank=True, verbose_name="Паспорт серияси")
    is_registered = models.BooleanField(default=True, verbose_name="Рўйхатдан ўтганми")
    is_active = models.BooleanField(default=True, verbose_name="Актив")
    hire_date = models.DateField(null=True, blank=True, verbose_name="Ишга кирган санаси")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "employees"
        verbose_name = "Ходим"
        verbose_name_plural = "Ходимлар"

    def __str__(self):
        return self.full_name


class EmployeeFace(BaseModel):
    """Ходим юз маълумотлари"""
    employee = models.ForeignKey(
        Employee, 
        on_delete=models.CASCADE, 
        related_name='faces',
        verbose_name="Ходим"
    )
    # SQLAlchemy-dagi Text Django-da TextField hisoblanadi
    face_encoding = models.TextField(verbose_name="Шифрланган юз маълумоти")
    image_path = models.CharField(max_length=500, null=True, blank=True, verbose_name="Rasm yo'li")
    confidence = models.FloatField(default=0.0, verbose_name="Ишонч даражаси")
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "employee_faces"
        verbose_name = "Ходим юзи"
        verbose_name_plural = "Ходимлар юзлари"


class WorkLog(BaseModel):
    """Иш вақти журнали"""
    employee = models.ForeignKey(
        Employee, 
        on_delete=models.CASCADE, 
        related_name='work_logs',
        verbose_name="Ходим"
    )
    check_in = models.DateTimeField(verbose_name="Келиш вақти")
    check_out = models.DateTimeField(null=True, blank=True, verbose_name="Кетиш вақti")
    location = models.ForeignKey(
        'Location', 
        on_delete=models.CASCADE, 
        related_name='work_logs',
        verbose_name="Локация"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "work_logs"
        verbose_name = "Иш журнали"
        verbose_name_plural = "Иш журналлари"