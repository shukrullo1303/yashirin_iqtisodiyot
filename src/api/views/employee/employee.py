from rest_framework import status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from django.core.files.storage import default_storage
from django.core.cache import cache
from django.db import transaction

from src.api.views.base import *
from src.core.services.face_recognition_service import FaceRecognitionService
from src.core.services.visitor_review_service import notify_employee_registered


class EmployeeViewSet(BaseModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        queryset = (
            models.Employee.objects.select_related("location")
            .prefetch_related("faces")
            .exclude(status='customer')
            .order_by("-id")
        )
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        # Soliq inspektori faqat o'ziga biriktirilgan lokatsiyalardagi barcha
        # xodimlarni ko'radi. Qaysi yozuvda INN yoki ro'yxatdan o'tish
        # ma'lumoti yetishmasligi UI orqali alohida ko'rsatiladi.
        return queryset

    def _can_manage_location(self, location):
        user = self.request.user
        return user.is_superuser

    def perform_create(self, serializer):
        if not self._can_manage_location(serializer.validated_data["location"]):
            raise PermissionDenied("Xodimni faqat superadmin yoki shu lokatsiya egasi boshqaradi.")
        serializer.save()
        cache.delete(f"face_encodings_{serializer.instance.location_id}")

    def perform_update(self, serializer):
        if not self._can_manage_location(serializer.validated_data.get("location", serializer.instance.location)):
            raise PermissionDenied("Xodimni tahrirlashga ruxsat yo'q.")
        previous_location_id = serializer.instance.location_id
        serializer.save()
        cache.delete(f"face_encodings_{previous_location_id}")
        cache.delete(f"face_encodings_{serializer.instance.location_id}")

    def perform_destroy(self, instance):
        if not self._can_manage_location(instance.location):
            raise PermissionDenied("Xodimni o'chirishga ruxsat yo'q.")
        location_id = instance.location_id
        instance.delete()
        cache.delete(f"face_encodings_{location_id}")

    @action(detail=True, methods=["post"], url_path="return-to-customer")
    @transaction.atomic
    def return_to_customer(self, request, pk=None):
        """Xodimning kamera yuz biriktirishini bekor qiladi.

        Shundan keyin shu yuz kamera tomonidan yana oddiy mijoz sifatida
        qayd etiladi. Tizim foydalanuvchisi/profili o'chirilmaydi.
        """
        if not request.user.is_superuser:
            raise PermissionDenied("Bu amal faqat superadmin uchun.")
        employee = self.get_object()
        employee.faces.all().delete()
        # Snapshot files also belong to the visit history. Removing the
        # employee association must not erase those entry/exit pictures.
        models.VisitorSession.objects.filter(employee=employee).update(is_employee=False, employee=None)
        # Tarixiy alertni saqlaymiz, ammo u qayta "potensial xodim" navbatiga
        # chiqmasin. Keyinchalik odam 3 soatlik yangi tashrif bilan qayta
        # aniqlansa, yangi PotentialEmployee yozuvi yaratiladi.
        models.PotentialEmployee.objects.filter(employee=employee).update(employee=None, status='registered')
        employee.face_embedding = ""
        employee.monitoring_id = None
        employee.is_registered = False
        employee.is_verified = False
        employee.status = "customer"
        employee.is_active = False
        employee.save(update_fields=["face_embedding", "monitoring_id", "is_registered", "is_verified", "status", "is_active", "updated_at"])
        cache.delete(f"face_encodings_{employee.location_id}")
        return Response({"message": "Xodim biriktirishi bekor qilindi. Kamera bu yuzni endi oddiy mijoz sifatida qayd qiladi."})

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

        notify_employee_registered(employee, actor=request.user, source='Administrator')

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
