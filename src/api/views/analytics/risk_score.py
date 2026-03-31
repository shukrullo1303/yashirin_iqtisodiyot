from src.api.views.base import *    



class RiskScoreViewSet(BaseModelViewSet):
    serializer_class = RiskScoreSerializer

    def get_queryset(self):
        queryset = models.RiskScore.objects.select_related("location").all().order_by("-date")
        location_id = self.request.query_params.get("location_id")
        date = self.request.query_params.get("date")

        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if date:
            queryset = queryset.filter(date__date=date)

        return queryset