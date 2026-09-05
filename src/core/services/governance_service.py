from src.core.models.governance import AuditLog, Notification


def audit(actor, action, entity, summary, location=None, before=None, after=None):
    AuditLog.objects.create(actor=actor, action=action, entity_type=entity.__class__.__name__, entity_id=str(entity.pk), location=location, summary=summary, before_data=before or {}, after_data=after or {})


def notify(*, key, title, message, level='warning', location=None, user=None):
    return Notification.objects.update_or_create(dedupe_key=key, defaults={'title': title, 'message': message, 'level': level, 'location': location, 'user': user, 'is_read': False})
