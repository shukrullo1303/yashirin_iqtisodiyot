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
_ANNOTATE_EVERY_N = 10        # run face annotation every N-th frame (~2.5fps at 25fps)


def _normalize_url(url: str) -> str:
    """'webcam', 'demo', 'test', '0', '1' → device index string. Else keep as-is."""
    s = url.strip()
    if s.lower() in ('webcam', 'demo', 'test'):
        return '0'
    return s


def _annotate_frame(frame, location_id: int = 0):
    """Draw face bboxes/labels on a frame using FaceRecognitionService."""
    try:
        from src.core.services.face_recognition_service import FaceRecognitionService
        fr = FaceRecognitionService()
        detections = fr.detect_faces(frame)
        for det in detections[:10]:
            try:
                x1, y1, x2, y2 = det.get("bbox") or [0, 0, 0, 0]
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = max(0, x2), max(0, y2)
                crop = frame[y1:y2, x1:x2]
                rec = fr.recognize_face_sync(crop, location_id=location_id) if (crop is not None and crop.size > 0) else {}
                if rec and rec.get("is_employee"):
                    label = rec.get("employee_name") or "employee"
                    color = (0, 200, 0)
                elif rec and rec.get("is_unregistered"):
                    label = "unknown"
                    color = (0, 140, 255)
                else:
                    label = "face"
                    color = (0, 255, 255)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(15, y1 - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)
            except Exception as exc:
                logger.debug("Annotate bbox failed: %s", exc)
    except Exception as exc:
        logger.debug("Annotate frame failed: %s", exc)
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
            if annotate:
                raw_frame = hub.get_frame(timeout=1)
                frame_bytes = None
                if raw_frame is not None:
                    if frame_count % _ANNOTATE_EVERY_N == 0:
                        raw_frame = _annotate_frame(raw_frame.copy(), location_id=location_id)
                    ok, jpeg = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    frame_bytes = jpeg.tobytes() if ok else None
            else:
                frame_bytes = hub.get_frame_bytes(timeout=1)

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
    """Single JPEG snapshot (optionally with face-annotation overlay)."""
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

    camera_service = CameraService()
    result = camera_service.capture_frame(stream_url, timeout=5)
    if not result.get('success') or result.get('frame') is None:
        return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    frame = _annotate_frame(result['frame'].copy(), location_id=location_id)
    ok, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return Response({'detail': 'Rasm kodlanmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return HttpResponse(jpeg.tobytes(), content_type='image/jpeg')


@api_view(['GET'])
def camera_stream_view(request):
    """MJPEG stream — use as <img src='/api/cameras/stream/?url=...'> in the frontend.

    Optional params:
      annotated=1        — draw face bbox/labels on every _ANNOTATE_EVERY_N-th frame
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
