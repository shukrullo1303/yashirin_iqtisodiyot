from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from src.core.models import User
from src.api.serializer.cafe import StaffSerializer, StaffCreateSerializer


class StaffViewSet(viewsets.ModelViewSet):
    """Cafe xodimlari (waiter, cafe_manager) CRUD — faqat manager va yuqori"""

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.filter(role__in=('waiter', 'cafe_manager', 'kitchen'))
        if user.is_superuser or user.role == 'admin':
            loc = self.request.query_params.get('location_id')
            if loc:
                qs = qs.filter(location_id=loc)
        elif user.role == 'business_owner':
            if user.location_id:
                qs = qs.filter(location_id=user.location_id)
        return qs.order_by('full_name')

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffCreateSerializer
        return StaffSerializer

    def create(self, request, *args, **kwargs):
        if not (request.user.is_superuser or request.user.role in ('admin', 'business_owner', 'cafe_manager')):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        data = request.data.copy()
        if 'location' not in data and request.user.role == 'business_owner' and request.user.location_id:
            data['location'] = request.user.location_id
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=201)

    def update(self, request, *args, **kwargs):
        if not (request.user.is_superuser or request.user.role in ('admin', 'business_owner', 'cafe_manager')):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_superuser or request.user.role in ('admin', 'business_owner', 'cafe_manager')):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def set_password(self, request, pk=None):
        staff = self.get_object()
        password = request.data.get('password', '')
        if len(password) < 4:
            return Response({'detail': 'Parol kamida 4 ta belgi'}, status=400)
        staff.set_password(password)
        staff.save()
        return Response({'detail': 'Parol yangilandi'})

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        staff = self.get_object()
        staff.is_active = not staff.is_active
        staff.save()
        return Response({'is_active': staff.is_active})
