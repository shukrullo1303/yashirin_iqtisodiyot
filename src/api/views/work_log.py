from src.api.views.base import *


class WorkLogViewSet(BaseModelViewSet):
    serializer_class = WorkLogSerializer

    def get_queryset(self):
        queryset = models.WorkLog.objects.select_related("employee", "location").all().order_by("-id")
        employee_id = self.request.query_params.get("employee_id")
        location_id = self.request.query_params.get("location_id")

        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset