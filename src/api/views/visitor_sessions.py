from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from src.core.models.customer import PotentialEmployee

from src.api.serializer.visitors import VisitorSessionSerializer
from src.api.views.base import BaseModelViewSet, models
from src.core.services.governance_service import audit
from src.core.services.visitor_review_service import register_reviewed_employee
from src.core.services.visitor_timing import todays_sessions


class VisitorSessionViewSet(BaseModelViewSet):
    serializer_class = VisitorSessionSerializer
    # POST is needed only for explicit @action endpoints such as
    # register-employee; the base create route is not exposed by the router.
    http_method_names = ["get", "head", "options", "post"]

    def get_queryset(self):
        queryset = models.VisitorSession.objects.select_related(
            "location", "entry_camera", "exit_camera"
        ).prefetch_related("events__camera").all()
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if self.request.query_params.get("today") in ("1", "true"):
            queryset = todays_sessions(queryset)
        if self.request.query_params.get("employee") in ("1", "true"):
            queryset = queryset.filter(is_employee=True)
        if self.request.query_params.get("customer") in ("1", "true"):
            queryset = queryset.filter(is_employee=False)
        if self.request.query_params.get("long_stay") in ("1", "true"):
            # Xodim hech qachon "uzoq qolgan mijoz" sifatida chiqmasin.
            queryset = queryset.filter(is_long_stay=True, is_employee=False)
        # Kecha yoki undan oldin kirgan, ammo chiqishi kamera tomonidan qayd
        # etilmagan odamlar o'chib ketmaydi. Ular superadmin nazorati uchun
        # alohida ro'yxatda ko'rsatiladi.
        if self.request.query_params.get("unclosed_previous_days") in ("1", "true"):
            queryset = queryset.filter(status="inside", entered_at__date__lt=timezone.localdate())
        return queryset

    @action(detail=False, methods=["get"])
    def inside(self, request):
        queryset = self.filter_queryset(self.get_queryset().filter(status="inside"))
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Kirish/chiqish kamerasi yonidagi real-time hisoblagichlar."""
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.localdate()
        today_rows = todays_sessions(queryset)
        inside_rows = queryset.filter(status="inside")
        potential_rows = PotentialEmployee.objects.filter(status="pending")
        allowed_ids = self._allowed_location_ids()
        if allowed_ids is not None:
            potential_rows = potential_rows.filter(location_id__in=allowed_ids)
        by_location = []
        for location_id, location_name in queryset.values_list("location_id", "location__name").distinct():
            location_today = today_rows.filter(location_id=location_id)
            location_inside = inside_rows.filter(location_id=location_id)
            by_location.append({
                "location_id": location_id,
                "location_name": location_name,
                "today_customers": location_today.filter(is_employee=False).count(),
                "today_employees": location_today.filter(is_employee=True).count(),
                "inside_customers": location_inside.filter(is_employee=False).count(),
                "inside_employees": location_inside.filter(is_employee=True).count(),
                "inside_total": location_inside.count(),
                "long_stay_today": location_today.filter(is_long_stay=True, is_employee=False).count(),
                "unclosed_previous_days": location_inside.filter(entered_at__date__lt=today).count(),
            })
        return Response({
            "today_customers": today_rows.filter(is_employee=False).count(),
            "today_employees": today_rows.filter(is_employee=True).count(),
            "inside_customers": inside_rows.filter(is_employee=False).count(),
            "inside_employees": inside_rows.filter(is_employee=True).count(),
            "inside_total": inside_rows.count(),
            "long_stay_today": today_rows.filter(is_long_stay=True, is_employee=False).count(),
            "unclosed_previous_days": inside_rows.filter(entered_at__date__lt=today).count(),
            "potential_employees": potential_rows.count(),
            "by_location": by_location,
            "updated_at": timezone.now(),
        })

    @action(detail=True, methods=["post"], url_path="register-employee")
    def register_employee(self, request, pk=None):
        if request.user.role not in {"admin", "tax_inspector"} and not request.user.is_superuser:
            return Response({"detail": "Faqat admin yoki soliq inspektori ro'yxatdan o'tkazadi."}, status=status.HTTP_403_FORBIDDEN)
        session = self.get_object()
        full_name = str(request.data.get("full_name", "")).strip()
        if not full_name:
            return Response({"full_name": ["Ism-familiya majburiy."]}, status=status.HTTP_400_BAD_REQUEST)
        jshshir = str(request.data.get('jshshir') or request.data.get('inn') or '').strip()
        if not jshshir.isdigit() or len(jshshir) != 14:
            return Response({'jshshir': ["JSHSHIR aynan 14 ta raqamdan iborat bo'lishi kerak."]}, status=status.HTTP_400_BAD_REQUEST)
        if session.is_employee:
            return Response({"detail": "Bu tashrif allaqachon xodimga biriktirilgan."}, status=status.HTTP_400_BAD_REQUEST)
        employee = register_reviewed_employee(session, request.data)
        return Response({"employee_id": employee.id, "message": "Xodim yuz ma'lumoti bilan ro'yxatdan o'tkazildi."})

    @action(detail=True, methods=["post"], url_path="merge")
    def merge(self, request, pk=None):
        """Superadmin tasdiqlagan bir odamning ikkita noto'g'ri sessiyasini birlashtiradi."""
        if not request.user.is_superuser:
            return Response({"detail": "Faqat superadmin tashriflarni birlashtiradi."}, status=status.HTTP_403_FORBIDDEN)
        target = self.get_object()
        source_id = request.data.get("source_id")
        try:
            source = models.VisitorSession.objects.get(pk=source_id, location=target.location)
        except models.VisitorSession.DoesNotExist:
            return Response({"source_id": ["Shu lokatsiyadagi tashrif topilmadi."]}, status=status.HTTP_400_BAD_REQUEST)
        if source.pk == target.pk:
            return Response({"source_id": ["Bir xil tashrifni birlashtirib bo'lmaydi."]}, status=status.HTTP_400_BAD_REQUEST)
        models.VisitorEvent.objects.filter(visitor_session=source).update(visitor_session=target)
        target.entered_at = min(target.entered_at, source.entered_at)
        target.last_seen_at = max(target.last_seen_at, source.last_seen_at)
        target.exited_at = max(filter(None, [target.exited_at, source.exited_at]), default=None)
        target.status = "completed" if target.exited_at else "inside"
        target.stay_duration = ((target.exited_at or target.last_seen_at) - target.entered_at).total_seconds() / 60
        if not target.face_embedding:
            target.face_embedding = source.face_embedding
        if not target.entry_image_path:
            target.entry_image_path = source.entry_image_path
        if not target.exit_image_path:
            target.exit_image_path = source.exit_image_path
        target.save()
        source_potential = models.PotentialEmployee.objects.filter(visitor_session=source).first()
        if source_potential:
            if models.PotentialEmployee.objects.filter(visitor_session=target).exists():
                source_potential.delete()
            else:
                source_potential.visitor_session = target
                source_potential.save(update_fields=["visitor_session"])
        audit(request.user, "merge", target, f"Tashriflar birlashtirildi: {source.visitor_id} -> {target.visitor_id}", location=target.location)
        source.delete()
        return Response({"message": "Tashriflar birlashtirildi.", "visitor_id": target.visitor_id})

    @action(detail=True, methods=["post"], url_path="manual-checkout")
    @transaction.atomic
    def manual_checkout(self, request, pk=None):
        """Kamera chiqishni ko‘rmay qolsa, superadminning nazorat qaydi."""
        if not request.user.is_superuser:
            return Response({"detail": "Faqat superadmin chiqishni qo‘lda belgilaydi."}, status=status.HTTP_403_FORBIDDEN)
        session = self.get_object()
        session = models.VisitorSession.objects.select_for_update().get(pk=session.pk)
        if session.status != "inside":
            return Response({"detail": "Bu tashrif allaqachon chiqdi deb yopilgan."}, status=status.HTTP_400_BAD_REQUEST)

        raw_time = request.data.get("exited_at")
        exited_at = timezone.now()
        if raw_time:
            parsed = parse_datetime(str(raw_time))
            if parsed is None:
                return Response({"exited_at": ["Sana-vaqt formati noto‘g‘ri."]}, status=status.HTTP_400_BAD_REQUEST)
            exited_at = timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        if exited_at < session.entered_at:
            return Response({"exited_at": ["Chiqish vaqti kirish vaqtidan oldin bo‘lishi mumkin emas."]}, status=status.HTTP_400_BAD_REQUEST)
        if exited_at > timezone.now():
            return Response({"exited_at": ["Kelajakdagi vaqtni chiqish deb belgilab bo‘lmaydi."]}, status=status.HTTP_400_BAD_REQUEST)

        # Repeat visits only include time inside. The previous photographed
        # exit stays in its event; the current manual exit has no camera/photo.
        events = list(session.events.order_by("occurred_at", "id"))
        current_entry = None
        total_seconds = 0.0
        for event in events:
            if event.event_type == "entry" and current_entry is None:
                current_entry = event.occurred_at
            elif event.event_type == "exit" and current_entry is not None:
                total_seconds += max(0, (event.occurred_at - current_entry).total_seconds())
                current_entry = None
        if current_entry is None:
            if events:
                return Response({"detail": "Ochiq kirish qaydi topilmadi. Tashrif ro‘yxatini yangilang."}, status=status.HTTP_400_BAD_REQUEST)
            current_entry = session.entered_at
        if exited_at < current_entry:
            return Response({"exited_at": ["Chiqish vaqti oxirgi kirishdan oldin bo‘lishi mumkin emas."]}, status=status.HTTP_400_BAD_REQUEST)
        total_seconds += (exited_at - current_entry).total_seconds()

        session.exited_at = exited_at
        session.last_seen_at = max(session.last_seen_at, exited_at)
        session.stay_duration = round(total_seconds / 60, 2)
        session.exit_camera = None
        session.exit_image_path = ""
        session.exit_body_image_path = ""
        session.status = "completed"
        session.save(update_fields=["exited_at", "last_seen_at", "stay_duration", "exit_camera", "exit_image_path", "exit_body_image_path", "status", "updated_at"])
        models.VisitorEvent.objects.create(
            visitor_session=session, camera=None, event_type="exit", occurred_at=exited_at,
            image_path="", is_manual=True,
        )
        audit(
            request.user, "manual_checkout", session,
            f"Kamera chiqishni ko‘rmagan tashrif qo‘lda yopildi: {session.visitor_id}",
            location=session.location,
        )
        return Response({"message": "Tashrif chiqdi deb belgilandi.", "exited_at": exited_at})
