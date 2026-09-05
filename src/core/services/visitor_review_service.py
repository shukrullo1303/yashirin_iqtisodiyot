import logging
import threading
import uuid

from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from src.core.models import Employee, EmployeeFace, Notification, PotentialEmployee, User, VisitorSession
from src.core.services.visitor_timing import todays_sessions, visit_timing

logger = logging.getLogger(__name__)


def notify_employee_registered(employee, actor=None, source='Soliq inspektori'):
    """Xodim qo'shilganini superadmin, admin va tegishli soliqchiga yuboradi."""
    recipients = User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | Q(role='admin') | (
            Q(role='tax_inspector') & (
                Q(location_id=employee.location_id) | Q(assigned_locations__id=employee.location_id)
            )
        )
    ).distinct()
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            location_id=employee.location_id,
            level='info',
            title='Yangi xodim ro‘yxatga olindi',
            message=f'{employee.full_name} ({employee.jshshir or "JSHSHIR kiritilmagan"}) {source} tomonidan qo‘shildi. Kamera yuz ma’lumotlari va doimiy ID biriktirildi.',
            dedupe_key=f'employee-registered:{employee.id}:{recipient.id}:{uuid.uuid4().hex}',
        )


def queue_long_stay(session, now=None):
    now = now or timezone.now()
    minutes = visit_timing(session, now)['today_minutes']
    qualifies = not session.is_employee and session.employee_id is None and minutes >= getattr(settings, 'VISITOR_LONG_STAY_MINUTES', 180)
    if session.is_long_stay != qualifies:
        VisitorSession.objects.filter(pk=session.pk).update(is_long_stay=qualifies)
        session.is_long_stay = qualifies
    if not qualifies:
        return None
    alert, _ = PotentialEmployee.objects.get_or_create(visitor_session=session, defaults={
        'location_id': session.location_id, 'duration_minutes': minutes,
        'face_embedding': session.face_embedding, 'image_path': session.entry_image_path,
    })
    if alert.status != 'pending':
        # Superadmin xodimni qayta mijozga aylantirgan bo'lsa, ayni tashrif
        # yana 3 soatga yetganda alert qayta navbatga kirishi kerak. Tarixiy
        # yozuv o'chirilmaydi, faqat yangi tekshiruv uchun pending qilinadi.
        if alert.employee_id is None and not session.is_employee:
            alert.status = 'pending'
            alert.save(update_fields=['status'])
        else:
            return alert
    if alert.duration_minutes != minutes:
        alert.duration_minutes = minutes
        alert.save(update_fields=['duration_minutes'])
    recipients = User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | (Q(role='tax_inspector') & (
            Q(location_id=session.location_id) | Q(assigned_locations__id=session.location_id)
        ))
    ).distinct()
    for recipient in recipients:
        # Do not reset read state or issue the same alert every 30 seconds.
        Notification.objects.get_or_create(
            dedupe_key=f'visitor-review:{alert.id}:user:{recipient.id}',
            defaults={
                'user': recipient, 'location_id': session.location_id, 'level': 'warning',
                'title': '3 soatdan ko‘p qolgan mijoz — tekshiruv kerak',
                'message': f'{session.visitor_id}: bugungi qayd etilgan vaqt {int(minutes // 60)} soat {int(minutes % 60)} daqiqa. Shaxsni tekshiring; xodimligi tasdiqlansa ism-familiya bilan ro‘yxatdan o‘tkazing.',
            },
        )
    return alert


@transaction.atomic
def register_reviewed_employee(session, data):
    session = VisitorSession.objects.select_for_update().get(pk=session.pk)
    alerts = PotentialEmployee.objects.filter(visitor_session=session).order_by('-detected_at')
    # Ba'zi eski yozuvlarda embedding sessiyaga emas, alertga saqlangan
    # bo‘lishi mumkin. Soliqchi tasdiqlaganda shu nusxani ham xodim yuziga
    # biriktiramiz, shunda keyingi kamera kadri uni mijoz demaydi.
    face_embedding = session.face_embedding or (alerts.values_list('face_embedding', flat=True).first() or '')
    if session.employee_id:
        employee = session.employee
    else:
        employee = Employee.objects.create(
            location=session.location, full_name=str(data.get('full_name', '')).strip(),
            position=str(data.get('position', 'Xodim')), phone=str(data.get('phone', '')),
            passport_number=data.get('passport_number') or None, inn=data.get('inn') or None,
            jshshir=data.get('jshshir') or data.get('inn') or None,
            face_embedding=face_embedding, is_registered=True, is_verified=True,
            status='active', monitoring_id=session.visitor_id,
        )
        if face_embedding:
            EmployeeFace.objects.create(employee=employee, face_encoding=face_embedding,
                                        image_path=session.entry_image_path, confidence=1.0)
    session.is_employee = True
    session.employee = employee
    session.is_long_stay = False
    session.save(update_fields=['is_employee', 'employee', 'is_long_stay', 'updated_at'])
    for alert in alerts:
        Notification.objects.filter(dedupe_key__startswith=f'visitor-review:{alert.id}:').update(is_read=True)
    alerts.update(status='registered', employee=employee)
    cache.delete(f'face_encodings_{session.location_id}')
    notify_employee_registered(employee, source='Soliq inspektori')
    return employee


class VisitorReviewWorker:
    """Lightweight timer; it never opens webcams or requires a browser tab."""
    _thread = None
    _lock = threading.Lock()
    _stop = threading.Event()

    @classmethod
    def start(cls):
        with cls._lock:
            if cls._thread and cls._thread.is_alive():
                return
            cls._thread = threading.Thread(target=cls.run, name='visitor-review', daemon=True)
            cls._thread.start()

    @staticmethod
    def refresh(now=None):
        now = now or timezone.now()
        sessions = todays_sessions(VisitorSession.objects.all(), now).prefetch_related('events')
        for session in sessions:
            queue_long_stay(session, now)

    @classmethod
    def run(cls):
        while not cls._stop.is_set():
            try:
                close_old_connections()
                cls.refresh()
            except Exception:
                logger.exception('Visitor review refresh failed')
            finally:
                close_old_connections()
            cls._stop.wait(30)
