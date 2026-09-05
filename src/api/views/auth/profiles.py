from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from src.api.serializer.auth import UserSerializer
from src.core.models import Location, User
from src.core.services.governance_service import audit


class ProfileViewSet(viewsets.ModelViewSet):
    """Faqat superadmin yaratadigan tizim profillari."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    ALLOWED_ROLES = {"tax_inspector", "business_owner", "analyst"}

    def _can_manage(self):
        return self.request.user.is_superuser

    def get_queryset(self):
        if not self._can_manage():
            return User.objects.none()
        return User.objects.filter(is_superuser=False).select_related("location").order_by("full_name", "username")

    def create(self, request, *args, **kwargs):
        if not self._can_manage():
            return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
        username = str(request.data.get("username", "")).strip()
        full_name = str(request.data.get("full_name", "")).strip()
        password = str(request.data.get("password", ""))
        role = str(request.data.get("role", ""))
        location_id = request.data.get("location") or None
        assigned_location_ids = request.data.get("assigned_locations", []) or []
        if not username or not full_name or len(password) < 4:
            return Response({"detail": "Login, F.I.Sh. va kamida 4 belgili parol majburiy."}, status=status.HTTP_400_BAD_REQUEST)
        if role not in self.ALLOWED_ROLES:
            return Response({"role": ["Faqat soliq inspektori, lokatsiya egasi yoki analitik yaratiladi."]}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"username": ["Bu login band."]}, status=status.HTTP_400_BAD_REQUEST)
        location = None
        if location_id:
            try:
                location = Location.objects.get(pk=location_id)
            except Location.DoesNotExist:
                return Response({"location": ["Lokatsiya topilmadi."]}, status=status.HTTP_400_BAD_REQUEST)
        if role == "business_owner" and location is None:
            return Response({"location": ["Lokatsiya egasi uchun lokatsiya tanlang."]}, status=status.HTTP_400_BAD_REQUEST)
        if role == "tax_inspector":
            requested_ids = {int(item) for item in assigned_location_ids}
            inspectors = User.objects.filter(role="tax_inspector")
            occupied_ids = set(inspectors.values_list("assigned_locations__id", flat=True))
            occupied_ids.update(inspectors.values_list("location_id", flat=True))
            if requested_ids.intersection({item for item in occupied_ids if item}):
                return Response({"assigned_locations": ["Tanlangan lokatsiya boshqa soliq inspektoriga biriktirilgan."]}, status=status.HTTP_400_BAD_REQUEST)
            # Soliqchi uchun faqat ko‘p-lokatsiyali assigned_locations ishlatiladi.
            location = None
        user = User(username=username, full_name=full_name, role=role, location=location, is_active=True, is_approved=True)
        user.set_password(password)
        user.save()
        if role == "business_owner" and location:
            location.owner = user
            location.save(update_fields=["owner", "updated_at"])
        if role == "tax_inspector":
            allowed = Location.objects.filter(id__in=requested_ids)
            user.assigned_locations.set(allowed)
        audit(request.user, "create", user, f"Profil yaratildi: {user.full_name}", location=location)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        if not self._can_manage():
            return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
        profile = self.get_object()
        for field in ("full_name", "role", "is_active"):
            if field in request.data:
                setattr(profile, field, request.data[field])
        if "username" in request.data:
            username = str(request.data["username"]).strip()
            if not username:
                return Response({"username": ["Login majburiy."]}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(pk=profile.pk).filter(username=username).exists():
                return Response({"username": ["Bu login band."]}, status=status.HTTP_400_BAD_REQUEST)
            profile.username = username
        if "password" in request.data and str(request.data["password"]):
            password = str(request.data["password"])
            if len(password) < 4:
                return Response({"password": ["Parol kamida 4 belgi bo'lishi kerak."]}, status=status.HTTP_400_BAD_REQUEST)
            profile.set_password(password)
        if "location" in request.data and profile.role != "tax_inspector":
            location_id = request.data["location"] or None
            try:
                profile.location = Location.objects.get(pk=location_id) if location_id else None
            except Location.DoesNotExist:
                return Response({"location": ["Lokatsiya topilmadi."]}, status=status.HTTP_400_BAD_REQUEST)
        if profile.role not in self.ALLOWED_ROLES:
            return Response({"role": ["Ruxsat etilmagan rol."]}, status=status.HTTP_400_BAD_REQUEST)
        if profile.role == "tax_inspector":
            # Eski bir-lokatsiya biriktirilishini tozalab, uni yagona
            # assigned_locations mexanizmiga o‘tkazamiz.
            profile.location = None
        assigned_location_ids = request.data.get("assigned_locations")
        if assigned_location_ids is not None:
            if profile.role != "tax_inspector":
                return Response({"detail": "Bir nechta lokatsiya faqat soliq inspektoriga biriktiriladi."}, status=status.HTTP_400_BAD_REQUEST)
            requested_ids = {int(item) for item in assigned_location_ids}
            inspectors = User.objects.filter(role="tax_inspector").exclude(pk=profile.pk)
            occupied_ids = set(inspectors.values_list("assigned_locations__id", flat=True))
            occupied_ids.update(inspectors.values_list("location_id", flat=True))
            if requested_ids.intersection({item for item in occupied_ids if item}):
                return Response({"assigned_locations": ["Tanlangan lokatsiya boshqa soliq inspektoriga biriktirilgan."]}, status=status.HTTP_400_BAD_REQUEST)
            profile.assigned_locations.set(Location.objects.filter(id__in=requested_ids))
        profile.save()
        audit(request.user, "update", profile, f"Profil tahrirlandi: {profile.full_name}", location=profile.location)
        return Response(UserSerializer(profile).data)

    def destroy(self, request, *args, **kwargs):
        if not self._can_manage():
            return Response({"detail": "Ruxsat yo'q"}, status=status.HTTP_403_FORBIDDEN)
        profile = self.get_object()
        if profile.pk == request.user.pk:
            return Response({"detail": "O'zingizning profilingizni bu yerdan o'chira olmaysiz."}, status=status.HTTP_400_BAD_REQUEST)
        audit(request.user, "delete", profile, f"Profil o'chirildi: {profile.full_name}", location=profile.location)
        profile.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
