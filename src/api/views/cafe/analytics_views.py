from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.utils import timezone
from datetime import timedelta, date
from django.db.models import Count, Sum, F, DecimalField, ExpressionWrapper
from django.db.models.functions import ExtractHour, ExtractWeekDay, TruncDate

from src.core.models import Order, OrderItem


UZBEK_HOLIDAYS = [
    (1,  1,  "Yangi yil"),
    (3,  8,  "Xalqaro xotin-qizlar kuni"),
    (3,  21, "Navro'z"),
    (5,  9,  "Xotira va qadrlash kuni"),
    (6,  1,  "Bolalar himoyasi kuni"),
    (8,  31, "Mustaqillik kuni"),
    (10, 1,  "O'qituvchi va murabbiylar kuni"),
    (12, 8,  "O'zbekiston Konstitutsiyasi kuni"),
    (1,  14, "Vatan himoyachilari kuni"),
]

WEEKDAY_NAMES = {1: 'Yakshanba', 2: 'Dushanba', 3: 'Seshanba', 4: 'Chorshanba',
                 5: 'Payshanba', 6: 'Juma', 7: 'Shanba'}


class CafeAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        location_id = request.query_params.get('location_id')

        now = timezone.now()
        start = now - timedelta(days=days)

        paid_qs = Order.objects.filter(opened_at__gte=start, status='paid')
        all_qs = Order.objects.filter(opened_at__gte=start)
        if location_id:
            paid_qs = paid_qs.filter(table__location_id=location_id)
            all_qs = all_qs.filter(table__location_id=location_id)

        # Peak hours — count orders per hour
        peak_hours = list(
            all_qs.annotate(hour=ExtractHour('opened_at'))
            .values('hour')
            .annotate(count=Count('id'))
            .order_by('hour')
        )

        # Popular menu items by quantity sold
        revenue_expr = ExpressionWrapper(
            F('price') * F('quantity'),
            output_field=DecimalField(max_digits=14, decimal_places=2)
        )
        popular_items = list(
            OrderItem.objects.filter(order__in=paid_qs)
            .values('menu_item__name')
            .annotate(
                total_qty=Sum('quantity'),
                total_revenue=Sum(revenue_expr),
            )
            .order_by('-total_qty')[:12]
        )

        # Daily revenue — last N days
        daily_list = []
        orders_for_revenue = list(
            paid_qs.annotate(date=TruncDate('opened_at'))
            .values('date')
            .annotate(count=Count('id'))
            .order_by('date')
        )
        # Compute revenue per day using Python (Order.total uses items.all())
        from django.db.models.functions import TruncDate as TD
        daily_revenue_map = {}
        for order in paid_qs.prefetch_related('items'):
            day = order.opened_at.date().isoformat()
            daily_revenue_map[day] = daily_revenue_map.get(day, 0) + float(order.total)

        for row in orders_for_revenue:
            day_str = row['date'].isoformat() if hasattr(row['date'], 'isoformat') else str(row['date'])
            daily_list.append({
                'date': day_str,
                'count': row['count'],
                'revenue': round(daily_revenue_map.get(day_str, 0), 0),
            })

        # Weekly pattern (day of week 1=Sunday..7=Saturday in Django)
        weekly_raw = list(
            all_qs.annotate(weekday=ExtractWeekDay('opened_at'))
            .values('weekday')
            .annotate(count=Count('id'))
            .order_by('weekday')
        )
        weekly = [
            {'weekday': r['weekday'], 'name': WEEKDAY_NAMES.get(r['weekday'], ''), 'count': r['count']}
            for r in weekly_raw
        ]

        # Summary
        total_orders = all_qs.count()
        paid_orders = paid_qs.count()
        total_revenue = sum(daily_revenue_map.values())
        avg_order_value = total_revenue / max(paid_orders, 1)

        # Upcoming holidays + prediction
        today = date.today()
        avg_daily = total_orders / max(days, 1)
        upcoming_holidays = []
        for month, day_num, name in UZBEK_HOLIDAYS:
            try:
                h = date(today.year, month, day_num)
                if h < today:
                    h = date(today.year + 1, month, day_num)
                days_until = (h - today).days
                if 0 <= days_until <= 90:
                    multiplier = 1.8 if name in ["Navro'z", "Yangi yil"] else 1.4
                    upcoming_holidays.append({
                        'date': str(h),
                        'name': name,
                        'days_until': days_until,
                        'multiplier': multiplier,
                        'predicted_orders': round(avg_daily * multiplier),
                        'predicted_revenue': round(avg_daily * multiplier * avg_order_value),
                    })
            except ValueError:
                pass
        upcoming_holidays.sort(key=lambda x: x['days_until'])

        # Order type breakdown
        type_breakdown = list(
            all_qs.values('order_type')
            .annotate(count=Count('id'))
            .order_by('order_type')
        )

        return Response({
            'period_days': days,
            'summary': {
                'total_orders': total_orders,
                'paid_orders': paid_orders,
                'total_revenue': round(total_revenue, 0),
                'avg_order_value': round(avg_order_value, 0),
            },
            'peak_hours': peak_hours,
            'popular_items': popular_items,
            'daily_revenue': daily_list,
            'weekly_pattern': weekly,
            'upcoming_holidays': upcoming_holidays,
            'order_type_breakdown': type_breakdown,
        })
