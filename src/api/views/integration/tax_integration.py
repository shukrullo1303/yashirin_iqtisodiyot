from src.api.views.base import *    


class TaxIntegrationViewSet(BaseModelViewSet):
    serializer_class = TaxIntegrationSerializer

    def get_queryset(self):
        queryset = models.TaxIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset
