from django.db.models import Sum, Count
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from src.core.models.analytics import Analytics



class DashboardStatsView(APIView):
    def get(self, request):
        today = timezone.now().date()
        # Bugungi mijozlar soni (Behavioral modulidan)
        customer_count = Analytics.objects.filter(date=today).aggregate(total=Sum('queue_length'))['total'] or 0
        
        # Taxminiy tushum (Mijozlar soni * o'rtacha chek)
        # Bu yerda tushumni prognoz qilish algoritmini ulaymiz
        estimated_revenue = customer_count * 50000  # Masalan, har bir mijoz 50k so'm
        
        return Response({
            "customers": customer_count,
            "revenue": estimated_revenue,
            "growth": "+12%" # Kechagiga nisbatan o'sish
        })