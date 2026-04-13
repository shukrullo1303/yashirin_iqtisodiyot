from rest_framework import status
from rest_framework.response import Response

from src.api.views.base import *
from src.core.services.face_recognition_service import FaceRecognitionService


class EmployeeViewSet(BaseModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = (
            models.Employee.objects.select_related("location")
            .prefetch_related("faces")
            .all()
            .order_by("-id")
        )
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        employee = serializer.instance

        if request.FILES.get("image"):
            image_file = request.FILES.get("image")
            face_service = FaceRecognitionService()
            result = face_service.add_employee_face(employee.id, image_file.read())
            if not result.get("success"):
                data = serializer.data
                data.update({"face_warning": result.get("error", "face could not be added")})
                headers = self.get_success_headers(serializer.data)
                return Response(data, status=status.HTTP_201_CREATED, headers=headers)

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if request.FILES.get('image'):
            image_file = request.FILES.get('image')
            face_service = FaceRecognitionService()
            face_service.add_employee_face(instance.id, image_file.read())

        return Response(serializer.data)
