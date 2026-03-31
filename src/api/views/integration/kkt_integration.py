from src.api.views.base import *    




class KKTIntegrationViewSet(BaseModelViewSet):
    serializer_class = KKTIntegrationSerializer

    def get_queryset(self):
        queryset = models.KKTIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset
