import ssl
import time
import threading
import urllib.request
import urllib.error
import urllib.parse
import cv2
from django.http import StreamingHttpResponse, HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from typing import Optional
import logging

from src.core.services.camera_service import CameraService

logger = logging.getLogger(__name__)

_INITIAL_FRAME_TIMEOUT = 12
_FRAME_IDLE_TIMEOUT = 20
_ANNOTATE_EVERY_N = 3

# Shared live detection stats: { stream_url -> {employees, customers, ts} }
_LIVE_STATS: dict = {}

# Singleton viz-service cache: { (stream_url, location_id) -> FaceDetectionVisualizationService }
_VIZ_SERVICES: dict = {}
# Browser orqali olingan lokal webcamlar uchun monitor holati (track/ID)
# har kadrda yo'qolib ketmasligi kerak.
_LOCAL_MONITORS: dict = {}
_LOCAL_MONITORS_LOCK = threading.Lock()
# Har lokal webcam o'zining eng oxirgi AI tahlil vaqtini saqlaydi. Bu holat
# yuqoridagi umumiy ro'yxatda emas, aynan kamera kartasida ko'rsatiladi.
_LOCAL_CAMERA_ANALYSIS: dict = {}
_LOCAL_CAMERA_ANALYSIS_LOCK = threading.Lock()


def _normalize_url(url: str) -> str:
    """'webcam', 'demo', 'test', '0', '1' → device index string. Else keep as-is."""
    s = url.strip()
    if s.lower() in ('webcam', 'demo', 'test'):
        return '0'
    return s


def _get_viz_service(location_id: int, stream_url: str):
    """Return a cached FaceDetectionVisualizationService; create only once per (url, location)."""
    from src.core.services.face_detection_visualization_service import FaceDetectionVisualizationService
    key = (stream_url, location_id)
    if key not in _VIZ_SERVICES:
        _VIZ_SERVICES[key] = FaceDetectionVisualizationService(location_id=location_id)
    return _VIZ_SERVICES[key]


def _annotate_frame_with_viz_service(frame, location_id: int = 0, stream_url: str = ''):
    """
    Draw face bboxes/labels using FaceDetectionVisualizationService.
    - Mijozlar: sariq to'rtburchak
    - Xodimlar: sariq to'rtburchak va "Xodim: F.I.Sh." yozuvi
    - Pastki o'ng burchakda live statistika overlay
    """
    try:
        from django.utils import timezone

        viz_service = _get_viz_service(location_id, stream_url)
        annotated_frame, stats = viz_service.process_frame(
            frame,
            location_id=location_id,
            timestamp=timezone.now(),
        )

        # Live stats ni saqlash (frontend polling uchun)
        if stream_url:
            _LIVE_STATS[stream_url] = {
                'employees': stats.get('employees_detected', 0),
                'customers': stats.get('customers_detected', 0),
                'daily_customers': stats.get('daily_customers', 0),
                'total': stats.get('total_faces', 0),
                'ts': time.time(),
            }

        return annotated_frame

    except Exception as exc:
        logger.warning(f"FaceDetectionVisualizationService failed: {exc}")
        return _annotate_frame_fallback(frame, location_id)


def _annotate_frame_fallback(frame, location_id: int = 0):
    """Fallback annotation using FaceRecognitionService directly."""
    try:
        from src.core.services.face_recognition_service import FaceRecognitionService

        fr = FaceRecognitionService()
        detections = fr.detect_faces(frame)

        if not detections:
            # Draw "No faces detected" message
            cv2.putText(frame, "Yuz topilmadi", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            return frame

        logger.debug(f"Fallback: Detected {len(detections)} faces")

        for det in detections[:10]:
            try:
                bbox = det.get("bbox")
                if bbox is None:
                    continue

                x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

                # Ensure valid coordinates
                h, w = frame.shape[:2]
                x1 = max(0, min(x1, w - 1))
                y1 = max(0, min(y1, h - 1))
                x2 = max(0, min(x2, w - 1))
                y2 = max(0, min(y2, h - 1))

                if x2 <= x1 or y2 <= y1:
                    continue

                crop = frame[y1:y2, x1:x2]
                rec = fr.recognize_face_sync(crop, location_id=location_id) if (crop is not None and crop.size > 0) else {}

                is_employee = bool(rec and rec.get("is_employee"))
                # Operator ekrani uchun aniqlangan odamlar sariq ramkada.
                color = (0, 220, 255)

                if is_employee:
                    label = f"Xodim: {rec.get('employee_name') or 'Noma’lum'}"
                else:
                    label = "Mijoz"

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                # Ismni tepada ko'rsatish
                if label:
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.6
                    thickness = 2
                    (text_width, text_height), baseline = cv2.getTextSize(label, font, font_scale, thickness)

                    # Qora fon
                    top_y = max(0, y1 - text_height - baseline - 5)
                    cv2.rectangle(
                        frame,
                        (x1, top_y),
                        (x1 + text_width, y1),
                        (0, 0, 0),
                        cv2.FILLED,
                    )

                    # Oq matn
                    cv2.putText(
                        frame,
                        label,
                        (x1, top_y + text_height + 2),
                        font,
                        font_scale,
                        (255, 255, 255),
                        thickness,
                        cv2.LINE_AA,
                    )
            except Exception as exc:
                logger.debug(f"Annotate bbox failed: {exc}")

    except Exception as exc:
        logger.debug(f"Annotate frame failed: {exc}")
    return frame


def _capture_snapshot(stream_url: str, timeout: int = 5) -> Optional[bytes]:
    camera_service = CameraService()
    result = camera_service.capture_frame(stream_url, timeout=timeout)
    if not result.get('success'):
        logger.warning('Snapshot capture failed for %s: %s', stream_url, result.get('error'))
        return None
    frame = result.get('frame')
    if frame is None:
        return None
    success, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return jpeg.tobytes() if success else None


def generate_mjpeg_stream(url: str, annotate: bool = False, location_id: int = 0):
    """
    MJPEG generator with timeout and optional face-annotation overlay.

    - Closes stream if no first frame within _INITIAL_FRAME_TIMEOUT seconds.
    - Closes stream if no frame for _FRAME_IDLE_TIMEOUT seconds (camera went offline).
    - When annotate=True, runs face detection every _ANNOTATE_EVERY_N frames.
    - Uses FaceDetectionVisualizationService for yellow rectangles and names.
    """
    camera_service = CameraService()
    hub = camera_service.get_stream_hub(url)
    hub.add_reference()

    start_time = time.time()
    last_frame_time = time.time()
    got_first_frame = False
    frame_count = 0
    boundary = b'--frame\r\n'

    try:
        while True:
            raw_frame = hub.get_frame(timeout=1)
            frame_bytes = None

            if raw_frame is not None:
                if annotate:
                    # Birinchi kadrni hech qachon AI model yuklanishini kutib
                    # ushlab turmaymiz. Aks holda webcam ochiq bo‘lsa ham
                    # brauzer 12 soniya ichida rasm ololmay oqimni uzadi.
                    # Dastlab xom tasvir chiqadi, keyingi kadrlarda sariq
                    # yuz ramkalari kesh orqali uzluksiz ko‘rinadi.
                    if frame_count > 0 and frame_count % _ANNOTATE_EVERY_N == 0:
                        raw_frame = _annotate_frame_with_viz_service(
                            raw_frame.copy(), location_id=location_id, stream_url=url
                        )
                    elif frame_count > 0:
                        viz = _get_viz_service(location_id, url)
                        raw_frame = viz.draw_cached_boxes(raw_frame.copy())

                ok, jpeg = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_bytes = jpeg.tobytes() if ok else None

            if frame_bytes:
                got_first_frame = True
                last_frame_time = time.time()
                frame_count += 1
                yield (boundary + b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                time.sleep(0.04)  # ~25 fps cap
                continue

            now = time.time()
            if not got_first_frame and (now - start_time) > _INITIAL_FRAME_TIMEOUT:
                logger.info('MJPEG: no first frame in %ds for %s — closing', _INITIAL_FRAME_TIMEOUT, url)
                return
            if got_first_frame and (now - last_frame_time) > _FRAME_IDLE_TIMEOUT:
                logger.info('MJPEG: idle for %ds for %s — closing', _FRAME_IDLE_TIMEOUT, url)
                return

            time.sleep(0.05)
    finally:
        hub.release_reference()


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def camera_stream_snapshot_view(request):
    """Single JPEG snapshot (optionally with face-annotation overlay).

    Uses FaceDetectionVisualizationService for:
    - Sariq to'rtburchaklar (yellow rectangles)
    - Xodim ismlari tepasida ko'rsatiladi
    - Mijozlar sonini hisoblaydi
    """
    stream_url = request.GET.get('url')
    if not stream_url:
        return Response({'detail': 'Stream URL kiritilmagan.'}, status=status.HTTP_400_BAD_REQUEST)

    stream_url = _normalize_url(stream_url)
    annotated = request.GET.get('annotated') in ('1', 'true', 'True')

    try:
        location_id = int(request.GET.get('location_id') or 0)
    except Exception:
        location_id = 0

    if not annotated:
        snapshot = _capture_snapshot(stream_url, timeout=5)
        if snapshot is None:
            return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return HttpResponse(snapshot, content_type='image/jpeg')

    # Annotated snapshot with face detection visualization
    camera_service = CameraService()
    result = camera_service.capture_frame(stream_url, timeout=5)
    if not result.get('success') or result.get('frame') is None:
        return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    frame = _annotate_frame_with_viz_service(result['frame'].copy(), location_id=location_id, stream_url=stream_url)
    ok, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return Response({'detail': 'Rasm kodlanmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return HttpResponse(jpeg.tobytes(), content_type='image/jpeg')


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def camera_stream_view(request):
    """MJPEG stream — use as <img src='/api/cameras/stream/?url=...'> in the frontend.

    Uses FaceDetectionVisualizationService for:
    - Sariq to'rtburchaklar (yellow rectangles)
    - Xodim ismlari tepasida ko'rsatiladi
    - Mijozlar sonini hisoblaydi

    Optional params:
      annotated=1        — draw face bbox/labels with yellow rectangles
      location_id=<int>  — passed to face recogniser for employee matching
    """
    stream_url = request.GET.get('url')
    if not stream_url:
        return Response({'detail': 'Stream URL kiritilmagan.'}, status=status.HTTP_400_BAD_REQUEST)

    stream_url = _normalize_url(stream_url)
    annotate = request.GET.get('annotated') in ('1', 'true', 'True')
    try:
        location_id = int(request.GET.get('location_id') or 0)
    except Exception:
        location_id = 0

    return StreamingHttpResponse(
        generate_mjpeg_stream(stream_url, annotate=annotate, location_id=location_id),
        content_type='multipart/x-mixed-replace; boundary=frame',
    )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def camera_local_frame_view(request):
    """Browserdagi lokal webcam kadrini AI tahlilga yuboradi.

    Windows fon jarayoni USB webcamni ocholmasa, operator brauzeri kamerani
    oladi. Shu endpoint kadrni doimiy monitor va annotatsiyaga uzatadi.
    """
    try:
        from src.core.models import Camera
        from src.core.services.visitor_monitor_service import VisitorMonitorService
        import numpy as np

        camera_id = int(request.query_params.get('camera_id') or 0)
        camera = Camera.objects.select_related('location').get(pk=camera_id, is_active=True)
        uploaded = request.FILES.get('frame')
        if uploaded is None:
            return Response({'detail': 'Kamera kadri yuborilmadi.'}, status=status.HTTP_400_BAD_REQUEST)
        frame = cv2.imdecode(np.frombuffer(uploaded.read(), dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            return Response({'detail': 'Kamera kadri o‘qilmadi.'}, status=status.HTTP_400_BAD_REQUEST)

        # setdefault(camera.id, VisitorMonitorService()) default argumentini
        # har kadrda yaratadi. Bu model/track holatini og'irlashtirib, kirish
        # va chiqish aniqlashini beqaror qilardi. Har kamera uchun bitta
        # monitorni haqiqatan ham qayta ishlatamiz.
        with _LOCAL_MONITORS_LOCK:
            monitor = _LOCAL_MONITORS.get(camera.id)
            if monitor is None:
                monitor = VisitorMonitorService()
                _LOCAL_MONITORS[camera.id] = monitor
        monitor.process_frame(camera, frame)
        with _LOCAL_CAMERA_ANALYSIS_LOCK:
            _LOCAL_CAMERA_ANALYSIS[camera.id] = timezone.now()
        # Brauzerda asl <video> oqimi 25-30 FPS bo'lib qolishi uchun butun
        # annotatsiyalangan JPEGni qaytarmaymiz. Monitor aniqlagan bboxlar
        # qayta YuNet/SFace ishlatmasdan frontendga uzatiladi.
        stream_key = f'local:{camera.id}'
        detections = [
            {
                'bbox': [int(value) for value in item.get('bbox', [])],
                'label': item.get('label') or 'Odam',
                'is_employee': bool(item.get('is_employee')),
            }
            for item in monitor.get_latest_detections()
            if len(item.get('bbox', [])) == 4
        ]
        _LIVE_STATS[stream_key] = {
            'employees': sum(1 for item in detections if item['is_employee']),
            'customers': sum(1 for item in detections if not item['is_employee']),
            'daily_customers': 0,
            'total': len(detections),
            'ts': time.time(),
        }
        return Response({'width': int(frame.shape[1]), 'height': int(frame.shape[0]), 'detections': detections})
    except Camera.DoesNotExist:
        return Response({'detail': 'Faol kamera topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        logger.exception('Local webcam frame analysis failed: %s', exc)
        return Response({'detail': 'Lokal webcam tahlilida xato yuz berdi.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def camera_live_stats_view(request):
    """
    Joriy MJPEG streamdan real vaqtda aniqlangan xodimlar va mijozlar sonini qaytaradi.
    ?url=<stream_url>
    """
    stream_url = request.GET.get('url', '').strip()
    if stream_url:
        stream_url = _normalize_url(stream_url)

    stale_after = 8  # seconds — if no frame annotated recently, return zeros

    if stream_url and stream_url in _LIVE_STATS:
        entry = _LIVE_STATS[stream_url]
        if time.time() - entry['ts'] <= stale_after:
            return Response({
                'employees': entry['employees'],
                'customers': entry['customers'],
                'daily_customers': entry['daily_customers'],
                'total': entry['total'],
                'live': True,
            })

    # Return zeros if stream not active or too stale
    return Response({'employees': 0, 'customers': 0, 'daily_customers': 0, 'total': 0, 'live': False})


@api_view(['GET'])
def camera_daily_customers_view(request):
    """Kunlik mijozlar sonini olish."""
    try:
        location_id = int(request.GET.get('location_id') or 0)
        if not location_id:
            return Response({'detail': 'location_id kiritilmagan.'}, status=status.HTTP_400_BAD_REQUEST)

        from src.core.services.face_detection_visualization_service import FaceDetectionVisualizationService

        # Service'ni yaratish
        viz_service = FaceDetectionVisualizationService(location_id=location_id)

        # Kunlik mijozlar sonini olish
        daily_customers = viz_service.get_daily_customers()
        summary = viz_service.get_tracked_faces_summary()

        return Response({
            'location_id': location_id,
            'daily_customers': daily_customers,
            'summary': summary,
        })

    except Exception as exc:
        logger.error(f"Error getting daily customers: {exc}")
        return Response(
            {'detail': 'Kunlik mijozlar sonini olishda xatolik.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
