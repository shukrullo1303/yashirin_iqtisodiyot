import io
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
from src.core.services.face_recognition_service import FaceRecognitionService

logger = logging.getLogger(__name__)

def _is_http_stream_url(url: str) -> bool:
    return url.lower().startswith('http://') or url.lower().startswith('https://')


def _http_stream_url_candidates(url: str):
    candidates = [url]
    if not _is_http_stream_url(url):
        return candidates

    parsed = urllib.parse.urlparse(url)
    path = parsed.path or ''
    if path.endswith('/video'):
        candidates.append(urllib.parse.urlunparse(parsed._replace(path=path + '.mjpg')))
        candidates.append(urllib.parse.urlunparse(parsed._replace(path=path[:-len('/video')] + '/video.mjpg')))
    elif path.endswith('/video.mjpg'):
        pass
    else:
        candidates.append(url.rstrip('/') + '/video.mjpg')

    return list(dict.fromkeys(candidates))


def _generate_mjpeg_from_http(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; CameraProbe/1.0)',
        'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
    }

    for candidate in _http_stream_url_candidates(url):
        request = urllib.request.Request(candidate, headers=headers)
        context = ssl.create_default_context()

        try:
            with urllib.request.urlopen(request, timeout=5, context=context) as response:
                content_type = response.getheader('Content-Type', '') or ''
                if 'text/html' in content_type.lower():
                    logger.debug('HTTP MJPEG candidate returned HTML: %s', candidate)
                    continue

                buffer = b''
                while True:
                    chunk = response.read(4096)
                    if not chunk:
                        break
                    buffer += chunk
                    start = buffer.find(b'\xff\xd8')
                    end = buffer.find(b'\xff\xd9', start + 2)
                    if start != -1 and end != -1:
                        frame_bytes = buffer[start:end + 2]
                        buffer = buffer[end + 2:]
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        except Exception as exc:
            logger.warning('HTTP MJPEG fallback failed for %s: %s', candidate, exc)
            continue


def _capture_snapshot(stream_url: str, timeout: int = 5) -> Optional[bytes]:
    camera_service = CameraService()
    result = camera_service.capture_frame(stream_url, timeout=timeout)
    if not result.get('success'):
        logger.warning('Snapshot capture failed for %s: %s', stream_url, result.get('error'))
        return None

    frame = result.get('frame')
    if frame is None:
        return None

    success, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    if not success:
        return None
    return jpeg.tobytes()


def _annotate_frame(frame, location_id: int = 0):
    """Kadrga yuz bbox/label chizadi (real-time ko‘rish uchun)."""
    if frame is None:
        return frame

    fr = FaceRecognitionService()
    detections = fr.detect_faces(frame)
    for det in detections[:10]:
        try:
            x1, y1, x2, y2 = det.get("bbox") or [0, 0, 0, 0]
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = max(0, x2), max(0, y2)
            crop = frame[y1:y2, x1:x2]
            rec = fr.recognize_face_sync(crop, location_id=location_id) if crop is not None and crop.size else {}
            label = "face"
            color = (0, 255, 255)
            if rec and rec.get("is_employee"):
                label = rec.get("employee_name") or "employee"
                color = (0, 200, 0)
            elif rec and rec.get("is_unregistered"):
                label = "unknown"
                color = (0, 140, 255)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame,
                str(label),
                (x1, max(15, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2,
                cv2.LINE_AA,
            )
        except Exception as exc:
            logger.debug("Annotate frame failed: %s", exc)
            continue

    return frame


def generate_mjpeg_stream(url):
    """Kameradan kadrlarni o'qib, MJPEG generatorini hosil qiladi"""
    camera_service = CameraService()
    hub = camera_service.get_stream_hub(url)
    hub.start(persistent=True)
    yield from hub.mjpeg_generator()


@api_view(['GET'])
def camera_stream_snapshot_view(request):
    """Kameraning hozirgi kadr snapshotini qaytaradi"""
    stream_url = request.GET.get('url')
    annotated = request.GET.get('annotated') in ('1', 'true', 'True')
    try:
        location_id = int(request.GET.get('location_id') or 0)
    except Exception:
        location_id = 0
    if not stream_url:
        return Response({'detail': 'Stream URL kiritilmagan.'}, status=status.HTTP_400_BAD_REQUEST)

    if not annotated:
        snapshot = _capture_snapshot(stream_url, timeout=5)
        if snapshot is None:
            return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return HttpResponse(snapshot, content_type='image/jpeg')

    camera_service = CameraService()
    result = camera_service.capture_frame(stream_url, timeout=5)
    if not result.get('success') or result.get('frame') is None:
        return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    frame = _annotate_frame(result['frame'], location_id=location_id)
    success, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    if not success:
        return Response({'detail': 'Rasm kodlanmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return HttpResponse(jpeg.tobytes(), content_type='image/jpeg')


@api_view(['GET'])
def camera_stream_view(request):
    """Frontend <img> tegi ulanadigan API endpoint"""
    stream_url = request.GET.get('url')
    if not stream_url:
        return StreamingHttpResponse(status=400)
    
    return StreamingHttpResponse(
        generate_mjpeg_stream(stream_url),
        content_type='multipart/x-mixed-replace; boundary=frame'
    )

