import ssl
import time
import urllib.request
import urllib.error
import urllib.parse
import cv2
from django.http import StreamingHttpResponse, HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from typing import Optional
import logging

from src.core.services.camera_service import CameraService

logger = logging.getLogger(__name__)

_INITIAL_FRAME_TIMEOUT = 12   # seconds to wait for first frame
_FRAME_IDLE_TIMEOUT = 20      # seconds of silence before closing stream
_ANNOTATE_EVERY_N = 5         # run face annotation every N-th frame (~5fps at 25fps)


def _normalize_url(url: str) -> str:
    """'webcam', 'demo', 'test', '0', '1' → device index string. Else keep as-is."""
    s = url.strip()
    if s.lower() in ('webcam', 'demo', 'test'):
        return '0'
    return s


def _annotate_frame_with_viz_service(frame, location_id: int = 0):
    """
    Draw face bboxes/labels on a frame using FaceDetectionVisualizationService.
    - Sariq to'rtburchaklar (yellow rectangles)
    - Xodim ismlari tepasida ko'rsatiladi
    - Mijozlar sonini hisoblaydi
    """
    try:
        from src.core.services.face_detection_visualization_service import FaceDetectionVisualizationService
        from django.utils import timezone

        # Service'ni yaratish (location_id bilan)
        viz_service = FaceDetectionVisualizationService(location_id=location_id)

        # Kadrni qayta ishlash va chizish
        annotated_frame, stats = viz_service.process_frame(
            frame,
            location_id=location_id,
            timestamp=timezone.now(),
        )

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

                # Sariq rang barcha yuzlar uchun
                color = (0, 255, 255)  # Yellow in BGR

                if rec and rec.get("is_employee"):
                    label = rec.get("employee_name") or "Xodim"
                elif rec and rec.get("is_unregistered"):
                    label = "Mijoz"
                else:
                    label = "Yuz"

                # Sariq to'rtburchak chizish
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
                    # Har _ANNOTATE_EVERY_N kadrda annotatsiya
                    if frame_count % _ANNOTATE_EVERY_N == 0:
                        raw_frame = _annotate_frame_with_viz_service(raw_frame.copy(), location_id=location_id)
                    else:
                        # Oraliq kadrlarda oddiy annotatsiya
                        raw_frame = _annotate_frame_fallback(raw_frame.copy(), location_id)

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

    frame = _annotate_frame_with_viz_service(result['frame'].copy(), location_id=location_id)
    ok, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return Response({'detail': 'Rasm kodlanmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return HttpResponse(jpeg.tobytes(), content_type='image/jpeg')


@api_view(['GET'])
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