from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from src.core.models import Camera, Employee, Location, User, VisitorEvent, VisitorSession


class CameraControlsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create(username='camera-test-admin', is_superuser=True, role='admin')
        self.client.force_authenticate(self.admin)
        self.location = Location.objects.create(name='Camera test', address='Test', location_type='other')

    def test_same_webcam_can_be_created_and_reassigned_to_four_active_cards(self):
        cameras = []
        for direction in ('entrance', 'entrance', 'exit', 'exit'):
            response = self.client.post('/api/cameras/', {
                'name': f'Test {direction}', 'location': self.location.id,
                'camera_type': direction, 'stream_url': '0',
                'ip_address': '127.0.0.1', 'is_active': True,
            })
            self.assertEqual(response.status_code, 201, response.data)
            cameras.append(response.data['id'])
        for camera_id in cameras:
            response = self.client.patch(f'/api/cameras/{camera_id}/', {'stream_url': '0', 'is_active': True})
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Camera.objects.filter(stream_url='0', is_active=True).count(), 4)

    def make_visit(self, *, employee=False, previous_day=False):
        self.entered = timezone.now() - timedelta(hours=25 if previous_day else 4)
        person = Employee.objects.create(location=self.location, full_name='Test employee') if employee else None
        session = VisitorSession.objects.create(
            location=self.location, entered_at=self.entered, last_seen_at=self.entered,
            entry_image_path='keep-entry.jpg', is_employee=employee, employee=person,
        )
        VisitorEvent.objects.create(visitor_session=session, event_type='entry', occurred_at=self.entered, image_path='keep-entry.jpg')
        return session

    def test_manual_checkout_keeps_customer_and_employee_history(self):
        for is_employee in (False, True):
            with self.subTest(employee=is_employee):
                session = self.make_visit(employee=is_employee)
                exit_at = timezone.now() - timedelta(minutes=1)
                response = self.client.post(f'/api/visitor-sessions/{session.id}/manual-checkout/', {'exited_at': exit_at.isoformat()})
                self.assertEqual(response.status_code, 200, response.data)
                session.refresh_from_db()
                self.assertEqual(session.status, 'completed')
                self.assertEqual(session.is_employee, is_employee)
                self.assertEqual(session.entry_image_path, 'keep-entry.jpg')
                event = session.events.get(event_type='exit')
                self.assertTrue(event.is_manual)
                self.assertEqual(event.image_path, '')
                self.assertEqual(event.occurred_at, exit_at)
                # Today's list still contains the completed record.
                result = self.client.get('/api/visitor-sessions/', {'today': 1, 'location_id': self.location.id}).data
                rows = result['results'] if isinstance(result, dict) else result
                self.assertIn(session.id, [row['id'] for row in rows])

    def test_second_visit_manual_checkout_sums_only_inside_time(self):
        session = self.make_visit()
        first_exit = self.entered + timedelta(minutes=30)
        second_entry = self.entered + timedelta(hours=2)
        VisitorEvent.objects.create(visitor_session=session, event_type='exit', occurred_at=first_exit, image_path='keep-first-exit.jpg')
        VisitorEvent.objects.create(visitor_session=session, event_type='entry', occurred_at=second_entry, image_path='keep-second-entry.jpg')
        session.exit_image_path = 'keep-first-exit.jpg'
        session.save()
        # A backdated exit cannot close the second visit before it began.
        url = f'/api/visitor-sessions/{session.id}/manual-checkout/'
        invalid = self.client.post(url, {'exited_at': (second_entry - timedelta(minutes=1)).isoformat()})
        self.assertEqual(invalid.status_code, 400)
        response = self.client.post(url, {'exited_at': (second_entry + timedelta(minutes=45)).isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        session.refresh_from_db()
        self.assertEqual(session.stay_duration, 75)
        self.assertEqual(session.exit_image_path, '')
        self.assertEqual(list(session.events.values_list('image_path', flat=True)), ['keep-entry.jpg', 'keep-first-exit.jpg', 'keep-second-entry.jpg', ''])

    def test_previous_day_checkout_and_superadmin_permission_remain_available(self):
        session = self.make_visit(previous_day=True)
        url = f'/api/visitor-sessions/{session.id}/manual-checkout/'
        inspector = User.objects.create(username='camera-test-inspector', role='tax_inspector', location=self.location)
        self.client.force_authenticate(inspector)
        self.assertEqual(self.client.post(url, {}).status_code, 403)
        session.refresh_from_db()
        self.assertEqual(session.status, 'inside')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(url, {'exited_at': (self.entered + timedelta(minutes=30)).isoformat()}).status_code, 200)
        self.assertTrue(session.events.filter(event_type='exit', is_manual=True).exists())
