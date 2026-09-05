from rest_framework.decorators import action
from rest_framework.response import Response
from src.api.views.base import BaseModelViewSet, models
from django.db.models import Q
from django.shortcuts import get_object_or_404


class AuditLogViewSet(BaseModelViewSet):
    serializer_class = None
    http_method_names = ['get', 'head', 'options']
    def list(self, request, *args, **kwargs):
        rows = self.filter_queryset(models.AuditLog.objects.select_related('actor', 'location'))[:300]
        return Response([{'id': row.id, 'action': row.action, 'entity_type': row.entity_type, 'summary': row.summary, 'location_name': row.location.name if row.location else None, 'actor_name': row.actor.full_name if row.actor else 'Tizim', 'created_at': row.created_at} for row in rows])


class NotificationViewSet(BaseModelViewSet):
    serializer_class = None
    http_method_names = ['get', 'head', 'options', 'post']
    def get_queryset(self):
        qs = models.Notification.objects.select_related('location', 'user')
        if self.request.user.is_superuser:
            return qs.filter(Q(user=self.request.user) | Q(user__isnull=True))
        return qs.filter(Q(user=self.request.user) | Q(user__isnull=True)).filter(location_id__in=(self._allowed_location_ids() or []))
    def list(self, request, *args, **kwargs):
        rows = self.get_queryset()[:100]
        return Response([{'id': n.id, 'level': n.level, 'title': n.title, 'message': n.message, 'is_read': n.is_read, 'location_name': n.location.name if n.location else None, 'created_at': n.created_at,
                          'action_url': f'/employees?potential_id={n.dedupe_key.split(":")[1]}&location_id={n.location_id}' if n.dedupe_key.startswith('visitor-review:') else None} for n in rows])
    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        row = get_object_or_404(self.get_queryset(), pk=pk); row.is_read = True; row.save(update_fields=['is_read', 'updated_at']); return Response({'ok': True})
