from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from src.core.models import User
from src.api.serializer.auth import UserSerializer, RegisterSerializer


class BossViewSet(viewsets.ModelViewSet):
    """Superadmin uchun boss akkauntlarni boshqarish"""
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not (user.is_superuser or user.role == 'admin'):
            return User.objects.none()
        return User.objects.filter(role='business_owner').select_related('location').order_by('full_name')

    def get_serializer_class(self):
        if self.action == 'create':
            return RegisterSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        if not (request.user.is_superuser or request.user.role == 'admin'):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        data = request.data.copy()
        data['role'] = 'business_owner'
        s = RegisterSerializer(data=data)
        s.is_valid(raise_exception=True)
        user = s.save()
        return Response(UserSerializer(user).data, status=201)

    @action(detail=True, methods=['post'])
    def set_password(self, request, pk=None):
        if not (request.user.is_superuser or request.user.role == 'admin'):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        boss = self.get_object()
        pwd = request.data.get('password', '')
        if len(pwd) < 4:
            return Response({'detail': 'Parol kamida 4 ta belgi'}, status=400)
        boss.set_password(pwd)
        boss.save()
        return Response({'detail': 'Parol yangilandi'})

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        if not (request.user.is_superuser or request.user.role == 'admin'):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        boss = self.get_object()
        boss.is_active = not boss.is_active
        boss.save()
        return Response({'is_active': boss.is_active})
