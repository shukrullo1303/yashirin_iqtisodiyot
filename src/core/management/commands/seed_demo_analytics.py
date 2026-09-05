from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from src.core.models import Analytics, Camera, CameraDowntime, Employee, Location, RiskScore, TaxIntegration, VisitorEvent, VisitorSession
from src.core.services.risk_scoring_service import RiskScoringService


class Command(BaseCommand):
    help = "Demo lokatsiyalar, mijozlar, xodimlar, soliq va analitika ma'lumotlarini yaratadi."

    def handle(self, *args, **options):
        now = timezone.now()
        today = timezone.localdate()
        admin = __import__('src.core.models', fromlist=['User']).User.objects.filter(is_superuser=True).first()
        image = self._demo_image()
        configs = [
            ("test1", "Test 1 demo lokatsiya", 32, 4, 1280000, 153600),
            ("test2", "Test 2 yuqori risk demo", 85, 2, 3400000, 40000),
            ("Demo Plaza", "Asaka tumani demo savdo nuqtasi", 58, 3, 2320000, 278400),
            ("Demo Choyxona", "Asaka tumani demo choyxona", 21, 2, 840000, 20000),
            ("Demo Service", "Asaka tumani demo xizmat markazi", 12, 3, 480000, 57600),
        ]
        locations = []
        for config_index, (name, address, customers, employees, revenue, tax_paid) in enumerate(configs, start=1):
            location, _ = Location.objects.get_or_create(
                name=name,
                defaults={"address": address, "location_type": "cafe", "tax_id": f"DEMO{config_index:03d}"},
            )
            entry_demo, _ = Camera.objects.get_or_create(location=location, camera_type="entrance", defaults={"name": f"{name} — Kirish demo", "ip_address": "127.0.0.1", "stream_url": "0", "is_active": False})
            exit_demo, _ = Camera.objects.get_or_create(location=location, camera_type="exit", defaults={"name": f"{name} — Chiqish demo", "ip_address": "127.0.0.1", "stream_url": "0", "is_active": False})
            for demo_camera in (entry_demo, exit_demo):
                if not demo_camera.is_active:
                    CameraDowntime.objects.get_or_create(camera=demo_camera, ended_at__isnull=True, defaults={"started_at": now - timedelta(hours=3), "reason": "Demo: ataylab nofaol qilingan"})
            for index in range(employees):
                employee, _ = Employee.objects.get_or_create(
                    location=location, full_name=f"Demo Xodim {index + 1} — {name}",
                    defaults={"position": "Demo xodim", "inn": f"{location.id:03d}{index + 1:011d}", "jshshir": f"{location.id:03d}{index + 1:011d}", "is_registered": True, "is_verified": True, "status": "active", "is_active": True},
                )
                if not employee.jshshir and employee.inn and str(employee.inn).isdigit() and len(str(employee.inn)) == 14:
                    employee.jshshir = str(employee.inn)
                    employee.save(update_fields=["jshshir", "updated_at"])
            for days_ago in range(6, -1, -1):
                day = today - timedelta(days=days_ago)
                multiplier = 0.72 + (6 - days_ago) * 0.045
                day_customers = max(1, round(customers * multiplier))
                day_revenue = round(revenue * multiplier)
                # Test2 ataylab yuqori tafovutli, qolganlari mos ssenariy.
                day_reported = round(day_revenue * (0.48 if name == "test2" else 0.98))
                Analytics.objects.update_or_create(
                    location=location, date=timezone.make_aware(__import__('datetime').datetime.combine(day, __import__('datetime').time.min)),
                    defaults={"real_customers": day_customers, "reported_revenue": day_reported, "estimated_revenue": day_revenue, "average_check": 40000, "discrepancy": day_revenue - day_reported, "discrepancy_percentage": round((day_revenue - day_reported) / max(day_revenue, 1) * 100, 2)},
                )
            tax_date = today
            TaxIntegration.objects.update_or_create(
                location=location, report_period=tax_date, report_period_type="daily",
                defaults={"tax_id": location.tax_id or f"MANUAL-{location.id}", "reported_revenue": revenue, "tax_paid": tax_paid, "entered_by": admin, "is_manual": True, "last_sync": now, "sync_status": "success"},
            )
            # Tashriflar grafigi uchun bugungi idempotent demo sessiyalar.
            entry_camera = Camera.objects.filter(location=location, camera_type="entrance").first()
            exit_camera = Camera.objects.filter(location=location, camera_type="exit").first()
            for index in range(min(customers, 100)):
                visitor_id = f"D{location.id:02d}{today.strftime('%m%d')}{index:03d}"
                entered = now - timedelta(minutes=customers - index)
                session, _ = VisitorSession.objects.update_or_create(
                    visitor_id=visitor_id,
                    defaults={"location": location, "entry_camera": entry_camera, "exit_camera": exit_camera, "entered_at": entered, "exited_at": entered + timedelta(minutes=25), "last_seen_at": entered + timedelta(minutes=25), "stay_duration": 25, "status": "completed", "is_employee": False, "entry_image_path": image, "exit_image_path": image},
                )
                VisitorEvent.objects.update_or_create(visitor_session=session, event_type="entry", defaults={"camera": entry_camera, "occurred_at": entered, "image_path": image})
                VisitorEvent.objects.update_or_create(visitor_session=session, event_type="exit", defaults={"camera": exit_camera, "occurred_at": entered + timedelta(minutes=25), "image_path": image})
            locations.append(location)
        service = RiskScoringService()
        for location in locations:
            service.calculate_risk_score_sync(location.id, now)
        self.stdout.write(self.style.SUCCESS(f"Demo analytics tayyor: {len(locations)} ta lokatsiya."))

    @staticmethod
    def _demo_image():
        media = Path("media")
        for path in media.rglob("*.jpg"):
            return str(path.relative_to(media)).replace("\\", "/")
        return ""
