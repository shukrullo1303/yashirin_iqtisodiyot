from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone

from src.core.models import CafeRoom, MenuCategory, MenuItem, Table, Order, OrderItem, User, InventoryItem
from src.api.serializer.cafe import (
    CafeRoomSerializer, MenuCategorySerializer, MenuItemSerializer, TableSerializer,
    OrderSerializer, OrderItemSerializer, InventoryItemSerializer,
)


def is_cafe_staff(user):
    return user.is_authenticated and (
        user.is_superuser or
        user.role in ('admin', 'business_owner', 'cafe_manager', 'waiter', 'kitchen')
    )


def is_manager_or_above(user):
    return user.is_authenticated and (
        user.is_superuser or
        user.role in ('admin', 'business_owner', 'cafe_manager')
    )


class MenuCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = MenuCategorySerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = MenuCategory.objects.prefetch_related('items').filter(is_active=True)
        location_id = self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def create(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().destroy(request, *args, **kwargs)


class CafeRoomViewSet(viewsets.ModelViewSet):
    serializer_class = CafeRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = CafeRoom.objects.filter(is_active=True)
        location_id = self.request.query_params.get('location_id')
        return qs.filter(location_id=location_id) if location_id else qs

    def create(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Faqat lokatsiya egasi yoki menejer xona qo‘sha oladi.'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo‘q'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo‘q'}, status=403)
        return super().destroy(request, *args, **kwargs)


class MenuItemViewSet(viewsets.ModelViewSet):
    serializer_class = MenuItemSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = MenuItem.objects.select_related('category')
        category_id = self.request.query_params.get('category_id')
        location_id = self.request.query_params.get('location_id')
        if category_id:
            qs = qs.filter(category_id=category_id)
        if location_id:
            qs = qs.filter(category__location_id=location_id)
        return qs

    def create(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().destroy(request, *args, **kwargs)


class TableViewSet(viewsets.ModelViewSet):
    serializer_class = TableSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Table.objects.select_related('location').prefetch_related('orders').filter(is_active=True)
        location_id = self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def create(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        data = request.data.copy()
        location_id = data.get('location') or getattr(request.user, 'location_id', None)
        if not data.get('number') and location_id:
            last = Table.objects.filter(location_id=location_id).order_by('-number').values_list('number', flat=True).first() or 0
            data['number'] = int(last) + 1
        if not data.get('location') and location_id:
            data['location'] = location_id
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().destroy(request, *args, **kwargs)


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Order.objects.select_related('table', 'waiter').prefetch_related('items__menu_item')
        location_id = self.request.query_params.get('location_id')
        status_param = self.request.query_params.get('status')
        if location_id:
            qs = qs.filter(table__location_id=location_id)
        if status_param:
            qs = qs.filter(status=status_param)
        # Waiters see only their own orders; kitchen sees all (open/ready)
        user = self.request.user
        if not is_manager_or_above(user):
            if user.role == 'waiter':
                qs = qs.filter(waiter=user)
            elif user.role == 'kitchen':
                qs = qs.filter(status__in=('open', 'ready'))
        return qs

    def perform_create(self, serializer):
        serializer.save(waiter=self.request.user)

    @action(detail=False, methods=['get'])
    def today(self, request):
        from django.utils.timezone import localdate
        qs = self.get_queryset().filter(opened_at__date=localdate())
        return Response(OrderSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def add_items(self, request, pk=None):
        order = self.get_object()
        if order.status != 'open':
            return Response({'detail': 'Faqat ochiq zakaz uchun'}, status=400)
        items_data = request.data.get('items', [])
        for item_data in items_data:
            menu_item = MenuItem.objects.get(id=item_data['menu_item'])
            qty = item_data.get('quantity', 1)
            existing = order.items.filter(menu_item=menu_item).first()
            if existing:
                existing.quantity += qty
                existing.save()
            else:
                OrderItem.objects.create(
                    order=order,
                    menu_item=menu_item,
                    quantity=qty,
                    price=menu_item.price,
                    note=item_data.get('note', ''),
                )
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        if new_status not in ('open', 'ready', 'paid', 'cancelled'):
            return Response({'detail': 'Noto\'g\'ri status'}, status=400)
        order.status = new_status
        if new_status in ('paid', 'cancelled'):
            order.closed_at = timezone.now()
        order.save()
        return Response(OrderSerializer(order).data)


class InventoryItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryItemSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = InventoryItem.objects.select_related('location')
        location_id = self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def create(self, request, *args, **kwargs):
        if not is_cafe_staff(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not is_cafe_staff(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not is_manager_or_above(request.user):
            return Response({'detail': 'Ruxsat yo\'q'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        item = self.get_object()
        try:
            delta = float(request.data.get('delta', 0))
        except (ValueError, TypeError):
            return Response({'detail': 'Noto\'g\'ri qiymat'}, status=400)
        item.quantity = max(0, float(item.quantity) + delta)
        item.save()
        return Response(InventoryItemSerializer(item).data)
