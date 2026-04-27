from src.core.models.base import *
from src.core.models.location import Location
from src.core.models.user import User


class MenuCategory(BaseModel):
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='menu_categories')
    name = models.CharField(max_length=100)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'menu_categories'
        ordering = ['order', 'name']

    def __str__(self):
        return f"{self.location.name} — {self.name}"


class MenuItem(BaseModel):
    category = models.ForeignKey(MenuCategory, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    image = models.ImageField(upload_to='menu/', null=True, blank=True)
    is_available = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        db_table = 'menu_items'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name

    @property
    def image_url(self):
        if self.image:
            return self.image.url
        return None


class Table(BaseModel):
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='tables')
    number = models.IntegerField()
    name = models.CharField(max_length=100, blank=True, default='')
    capacity = models.IntegerField(default=4)
    is_active = models.BooleanField(default=True)
    qr_token = models.UUIDField(default=__import__('uuid').uuid4, unique=True, editable=False)

    class Meta:
        db_table = 'cafe_tables'
        ordering = ['number']
        unique_together = [['location', 'number']]

    def __str__(self):
        return f"{self.location.name} — Stol {self.number}"


class Order(BaseModel):
    STATUS_CHOICES = [
        ('open', 'Ochiq'),
        ('ready', 'Tayyor'),
        ('paid', "To'langan"),
        ('cancelled', 'Bekor'),
    ]
    ORDER_TYPE_CHOICES = [
        ('dine_in', 'Restoranda'),
        ('delivery', 'Yetkazib berish'),
        ('takeaway', 'Olib ketish'),
    ]

    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    waiter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders_taken')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='dine_in')
    customer_name = models.CharField(max_length=200, blank=True, default='')
    customer_phone = models.CharField(max_length=20, blank=True, default='')
    delivery_address = models.TextField(blank=True, default='')
    note = models.TextField(blank=True, default='')
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'cafe_orders'
        ordering = ['-opened_at']

    def __str__(self):
        return f"Zakaz #{self.id} — {self.table_name}"

    @property
    def total(self):
        return sum(item.price * item.quantity for item in self.items.all())

    @property
    def table_name(self):
        if self.table:
            return self.table.name or f"Stol {self.table.number}"
        if self.order_type == 'delivery':
            return f"Yetkazib berish — {self.customer_name or 'Mijoz'}"
        if self.order_type == 'takeaway':
            return f"Olib ketish — {self.customer_name or 'Mijoz'}"
        return '—'

    @property
    def waiter_name(self):
        return self.waiter.full_name if self.waiter else None


class InventoryItem(BaseModel):
    UNIT_CHOICES = [
        ('dona', 'Dona'),
        ('kg', 'Kilogramm'),
        ('g', 'Gramm'),
        ('l', 'Litr'),
        ('ml', 'Millilitr'),
        ('paket', 'Paket'),
    ]
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='inventory_items')
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='dona')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    min_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'inventory_items'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.quantity} {self.unit})"

    @property
    def is_low(self):
        return self.quantity <= self.min_quantity


class OrderItem(BaseModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT)
    quantity = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'cafe_order_items'

    def __str__(self):
        return f"{self.menu_item.name} x{self.quantity}"

    @property
    def menu_item_name(self):
        return self.menu_item.name

    @property
    def menu_item_price(self):
        return str(self.menu_item.price)
