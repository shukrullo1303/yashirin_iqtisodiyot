from src.core.models.base import *


class AuditLog(BaseModel):
    ACTIONS = [("create", "Yaratish"), ("update", "Tahrirlash"), ("delete", "O'chirish"), ("restore", "Qaytarish"), ("merge", "Birlashtirish")]
    actor = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_actions')
    location = models.ForeignKey('Location', null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_logs')
    action = models.CharField(max_length=16, choices=ACTIONS)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    summary = models.CharField(max_length=500)
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']


class Notification(BaseModel):
    LEVELS = [("info", "Ma'lumot"), ("warning", "Ogohlantirish"), ("error", "Muhim")]
    user = models.ForeignKey('User', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications')
    location = models.ForeignKey('Location', null=True, blank=True, on_delete=models.CASCADE, related_name='notifications')
    level = models.CharField(max_length=10, choices=LEVELS, default='info')
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    dedupe_key = models.CharField(max_length=255, unique=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
