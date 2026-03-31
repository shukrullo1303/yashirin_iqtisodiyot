
from src.api.views.base import *


class LocationViewSet(BaseModelViewSet):
    queryset = models.Location.objects.select_related("owner").all().order_by("-id")
    serializer_class = LocationSerializer

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner")
        if owner is None and self.request.user.is_authenticated:
            owner = self.request.user
        serializer.save(owner=owner)

