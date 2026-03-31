from src.api.views.base import *


class EmployeeFaceViewSet(BaseModelViewSet):
    serializer_class = EmployeeFaceSerializer

    def get_queryset(self):
        queryset = models.EmployeeFace.objects.select_related("employee").all().order_by("-id")
        employee_id = self.request.query_params.get("employee_id")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        return queryset