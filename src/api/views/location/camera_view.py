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
    if not stream_url:
        return Response({'detail': 'Stream URL kiritilmagan.'}, status=status.HTTP_400_BAD_REQUEST)

    snapshot = _capture_snapshot(stream_url, timeout=5)
    if snapshot is None:
        return Response({'detail': 'Kameradan kadr olinmadi.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return HttpResponse(snapshot, content_type='image/jpeg')


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