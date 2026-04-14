from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from src.core.models.customer import CustomerVisit
from src.core.models.employee import Employee



class DashboardStatsView(APIView):
    def get(self, request):
        today = timezone.now().date()
        location_id = request.query_params.get("location_id")
        try:
            location_id_int = int(location_id) if location_id else None
        except Exception:
            location_id_int = None
        # Bugungi mijozlar soni (kameradan hisoblangan tashriflar bo‘yicha)
        visits = CustomerVisit.objects.filter(entered_at__date=today, is_employee=False)
        if location_id_int:
            visits = visits.filter(location_id=location_id_int)
        customer_count = visits.count()

        # Xodimlar soni (aktiv)
        employees = Employee.objects.filter(is_active=True, status='active')
        if location_id_int:
            employees = employees.filter(location_id=location_id_int)
        employee_count = employees.count()
        
        # Taxminiy tushum (Mijozlar soni * o'rtacha chek)
        # Bu yerda tushumni prognoz qilish algoritmini ulaymiz
        estimated_revenue = customer_count * 50000  # Masalan, har bir mijoz 50k so'm
        
        return Response({
            "customers": customer_count,
            "employees": employee_count,
            "revenue": estimated_revenue,
            "growth": "+12%" # Kechagiga nisbatan o'sish
        })
    
    