from src.api.views.base import *    


class AnalyticsViewSet(BaseModelViewSet):
    serializer_class = AnalyticsSerializer

    def get_queryset(self):
        queryset = models.Analytics.objects.select_related("location").all().order_by("-date")
        location_id = self.request.query_params.get("location_id")
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if start_date:
            queryset = queryset.filter(date__gte=start_date)
        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        return queryset
