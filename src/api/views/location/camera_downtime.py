from src.api.views.base import BaseModelViewSet, models
from src.api.serializer.camera_downtimes import CameraDowntimeSerializer


class CameraDowntimeViewSet(BaseModelViewSet):
    serializer_class = CameraDowntimeSerializer
    http_method_names = ['get', 'head', 'options']

    def get_queryset(self):
        queryset = models.CameraDowntime.objects.select_related('camera', 'camera__location').all()
        location_id = self.request.query_params.get('location_id')
        camera_id = self.request.query_params.get('camera_id')
        if location_id:
            queryset = queryset.filter(camera__location_id=location_id)
        if camera_id:
            queryset = queryset.filter(camera_id=camera_id)
        return queryset
