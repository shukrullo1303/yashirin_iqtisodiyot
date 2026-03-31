from src.api.views.base import *    



class HeatmapViewSet(BaseModelViewSet):
    serializer_class = HeatmapSerializer

    def get_queryset(self):
        queryset = models.Heatmap.objects.select_related("location").all().order_by("-date", "-hour")
        location_id = self.request.query_params.get("location_id")
        date = self.request.query_params.get("date")
        hour = self.request.query_params.get("hour")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if date:
            queryset = queryset.filter(date__date=date)
        if hour:
            queryset = queryset.filter(hour=hour)

        return queryset
