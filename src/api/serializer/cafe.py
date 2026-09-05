from rest_framework import serializers
from src.core.models import CafeRoom, MenuCategory, MenuItem, Table, Order, OrderItem, User, InventoryItem


class CafeRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = CafeRoom
        fields = ['id', 'location', 'name', 'width', 'height', 'position_x', 'position_y', 'is_active']


class MenuItemSerializer(serializers.ModelSerializer):
    image_url = serializers.ReadOnlyField()

    class Meta:
        model = MenuItem
        fields = ['id', 'category', 'name', 'description', 'price', 'image', 'image_url', 'is_available', 'order']


class MenuCategorySerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)

    class Meta:
        model = MenuCategory
        fields = ['id', 'location', 'name', 'order', 'is_active', 'items']


class TableSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    room_name = serializers.CharField(source='room.name', read_only=True)

    class Meta:
        model = Table
        fields = ['id', 'location', 'room', 'room_name', 'number', 'name', 'capacity', 'is_active', 'qr_token', 'position_x', 'position_y', 'shape', 'width', 'height', 'status']

    def get_status(self, obj):
        open_order = obj.orders.filter(status='open').first()
        if not open_order:
            return {'has_open_order': False, 'order_id': None, 'item_count': 0}
        return {
            'has_open_order': True,
            'order_id': open_order.id,
            'item_count': open_order.items.count(),
        }


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.ReadOnlyField()
    menu_item_price = serializers.ReadOnlyField()

    class Meta:
        model = OrderItem
        fields = ['id', 'order', 'menu_item', 'menu_item_name', 'menu_item_price', 'quantity', 'price', 'note']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    total = serializers.ReadOnlyField()
    table_name = serializers.ReadOnlyField()
    waiter_name = serializers.ReadOnlyField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    order_type_display = serializers.CharField(source='get_order_type_display', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'table', 'table_name', 'waiter', 'waiter_name',
            'status', 'status_display', 'order_type', 'order_type_display',
            'customer_name', 'customer_phone', 'delivery_address',
            'total', 'note', 'opened_at', 'closed_at', 'items',
        ]


class InventoryItemSerializer(serializers.ModelSerializer):
    is_low = serializers.ReadOnlyField()

    class Meta:
        model = InventoryItem
        fields = ['id', 'location', 'name', 'unit', 'quantity', 'min_quantity', 'is_low']


class StaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'role', 'location', 'is_active', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class StaffCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'role', 'location', 'is_active', 'password']

    def validate_role(self, value):
        if value not in ('waiter', 'cafe_manager', 'kitchen'):
            raise serializers.ValidationError("Faqat waiter, cafe_manager yoki kitchen rol bo'lishi mumkin.")
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
