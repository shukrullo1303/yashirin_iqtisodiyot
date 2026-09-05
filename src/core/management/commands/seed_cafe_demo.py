from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from src.core.models import CafeRoom, Location, MenuCategory, MenuItem, Order, OrderItem, Table, User


class Command(BaseCommand):
    help = "CRM uchun demo xona, stol, menyu, zakaz va login ma'lumotlarini yaratadi."

    def handle(self, *args, **options):
        location = Location.objects.filter(name='test1').first() or Location.objects.filter(is_active=True).first()
        if not location:
            self.stdout.write(self.style.WARNING('Avval lokatsiya yarating.'))
            return

        rooms = []
        for name in ('Asosiy zal', 'VIP xona', 'Yozgi ayvon'):
            room, _ = CafeRoom.objects.get_or_create(location=location, name=name, defaults={'width': 900, 'height': 560})
            rooms.append(room)
        for index in range(1, 13):
            room = rooms[(index - 1) // 5 if index <= 10 else 2]
            Table.objects.get_or_create(
                location=location, number=index,
                defaults={'room': room, 'name': f'Stol {index}', 'capacity': 2 if index % 3 == 0 else 4, 'position_x': 55 + ((index - 1) % 5) * 125, 'position_y': 75 + ((index - 1) // 5) * 100, 'shape': 'round' if index % 4 == 0 else 'rect'},
            )

        category, _ = MenuCategory.objects.get_or_create(location=location, name='Demo menyu', defaults={'order': 1})
        menu = []
        for name, price in (('Choy', 8000), ('Osh', 28000), ('Somsa', 12000), ('Salat', 14000), ('Sharbat', 10000)):
            item, _ = MenuItem.objects.get_or_create(category=category, name=name, defaults={'price': price, 'description': 'CRM demo mahsuloti'})
            menu.append(item)

        waiter, created = User.objects.get_or_create(username='demo_ofitsiant', defaults={'full_name': 'Demo Ofitsiant', 'role': 'waiter', 'location': location, 'is_active': True, 'is_approved': True})
        if created:
            waiter.set_password('1')
            waiter.save(update_fields=['password'])

        tables = list(Table.objects.filter(location=location).order_by('number')[:8])
        for index, table in enumerate(tables, start=1):
            order, _ = Order.objects.get_or_create(table=table, note='DEMO_CRM', customer_name=f'Demo mijoz {index}', defaults={'waiter': waiter, 'status': 'paid', 'order_type': 'dine_in', 'closed_at': timezone.now() - timedelta(minutes=index * 7)})
            if not order.items.exists():
                item = menu[(index - 1) % len(menu)]
                OrderItem.objects.create(order=order, menu_item=item, price=item.price, quantity=(index % 3) + 1)

        self.stdout.write(self.style.SUCCESS(f'CRM demo tayyor: {len(rooms)} xona, {len(tables)} stol, demo_ofitsiant / 1'))
