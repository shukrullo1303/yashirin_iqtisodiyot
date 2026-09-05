import io
import logging
import ssl
import time
import threading
import urllib.request
import urllib.parse
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.conf import settings
from django.core.cache import cache

try:
    from onvif import ONVIFCamera
except ImportError:  # pragma: no cover - optional dependency
    ONVIFCamera = None

from src.core.models.location import Camera

logger = logging.getLogger(__name__)

_STREAM_HUBS_LOCK = threading.Lock()
_STREAM_HUBS: Dict[str, "CameraStreamHub"] = {}


def _is_youtube_url(url: str) -> bool:
    """YouTube URL'ini aniqlash."""
    if not url:
        return False
    u = url.lower()
    return "youtube.com/" in u or "youtu.be/" in u


def _resolve_youtube_stream_url(url: str, cache_ttl_seconds: int = 10 * 60) -> str:
    """
    YouTube havolasini OpenCV o'qiy oladigan direct stream URL ga aylantiradi.
    URL'lar tez eskiradi, shuning uchun qisqa TTL bilan kesh qilinadi.
    """
    if not _is_youtube_url(url):
        return url

    cache_key = f"yt_stream_url:{hash(url)}"
    cached = cache.get(cache_key)
    if isinstance(cached, str) and cached:
        return cached

    try:
        import yt_dlp  # type: ignore

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": "best[ext=mp4]/best",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            direct = (info or {}).get("url")
            if isinstance(direct, str) and direct:
                cache.set(cache_key, direct, cache_ttl_seconds)
                return direct
    except Exception as exc:
        logger.warning("YouTube stream resolve failed: %s", exc)

    return url


def _normalize_stream_url(stream_url: str) -> str:
    """Stream URL'ni normallashtirish."""
    if not stream_url:
        return stream_url
    if _is_youtube_url(stream_url):
        return _resolve_youtube_stream_url(stream_url)
    return stream_url


class CameraStreamHub:
    """Kamera streamini boshqarish uchun hub."""

    def __init__(self, stream_url: str, timeout: int = 5, idle_timeout: int = 30):
        self.stream_url = stream_url
        self.timeout = timeout
        self.idle_timeout = idle_timeout
        self._lock = threading.RLock()
        self._frame: Optional[np.ndarray] = None
        self._frame_bytes: Optional[bytes] = None
        self._frame_id = 0
        self._reference_count = 0
        self._alive = False
        self._persistent = False
        self._thread: Optional[threading.Thread] = None
        self._new_frame = threading.Event()
        self._last_access = time.time()
        self._error_count = 0
        self._last_error: Optional[str] = None

    def start(self, persistent: bool = True):
        """Streamni boshlash."""
        with self._lock:
            self._last_access = time.time()
            if self._thread and self._thread.is_alive():
                if persistent:
                    self._persistent = True
                return
            self._alive = True
            if persistent:
                self._persistent = True
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def stop(self):
        """Streamni to'xtatish."""
        with self._lock:
            self._alive = False
            self._persistent = False
        if self._thread:
            self._thread.join(timeout=1)

    def add_reference(self):
        """Referens qo'shish."""
        with self._lock:
            self._reference_count += 1
            self._last_access = time.time()
        self.start(persistent=True)

    def release_reference(self):
        """Referensni ozod qilish."""
        with self._lock:
            self._reference_count = max(0, self._reference_count - 1)
            self._last_access = time.time()

    def get_frame(self, timeout: int = 5) -> Optional[np.ndarray]:
        """Kadr olish."""
        self.start()
        got = self._new_frame.wait(timeout)
        if not got:
            return None
        with self._lock:
            self._last_access = time.time()
            return None if self._frame is None else self._frame.copy()

    def get_frame_bytes(self, timeout: int = 5) -> Optional[bytes]:
        """Kadr baytlarini olish."""
        self.start()
        got = self._new_frame.wait(timeout)
        if not got:
            return None
        with self._lock:
            self._last_access = time.time()
            return self._frame_bytes

    def mjpeg_generator(self):
        """MJPEG formatida kadr berish."""
        self.add_reference()
        try:
            boundary = b'--frame\r\n'
            while self._alive:
                frame_bytes = self.get_frame_bytes(timeout=1)
                if not frame_bytes:
                    time.sleep(0.1)
                    continue
                yield (
                    boundary
                    + b'Content-Type: image/jpeg\r\n\r\n'
                    + frame_bytes
                    + b'\r\n'
                )
                time.sleep(0.03)
        finally:
            self.release_reference()

    def _set_frame(self, frame: np.ndarray) -> None:
        """Kadrni saqlash."""
        try:
            success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
            if not success:
                return
            with self._lock:
                self._frame = frame.copy()
                self._frame_bytes = buffer.tobytes()
                self._frame_id += 1
                self._new_frame.set()
                self._error_count = 0
        except Exception as exc:
            logger.debug('StreamHub frame encoding failed: %s', exc)

    @staticmethod
    def _cv2_source(stream_url: str):
        """Return int device index for digit strings like '0', else return string."""
        s = stream_url.strip()
        return int(s) if s.isdigit() else stream_url

    def get_status(self) -> Dict[str, Any]:
        """Hub holatini qaytarish."""
        with self._lock:
            return {
                "stream_url": self.stream_url,
                "alive": self._alive,
                "persistent": self._persistent,
                "reference_count": self._reference_count,
                "frame_id": self._frame_id,
                "error_count": self._error_count,
                "last_error": self._last_error,
                "last_access": self._last_access,
            }

    def _run(self):
        """Streamni o'qish uchun asosiy tsikl."""
        cap = None
        failure_delay = 0.2
        cv2_source = self._cv2_source(self.stream_url)
        while True:
            try:
                with self._lock:
                    alive = self._alive
                    idle = (
                        self._reference_count <= 0
                        and not self._persistent
                        and (time.time() - self._last_access) > self.idle_timeout
                    )
                if not alive or idle:
                    break

                if cap is None:
                    cap = cv2.VideoCapture(cv2_source)
                    if hasattr(cv2, 'CAP_PROP_BUFFERSIZE'):
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    if hasattr(cv2, 'CAP_PROP_OPEN_TIMEOUT_MSEC'):
                        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, self.timeout * 1000)
                    if hasattr(cv2, 'CAP_PROP_READ_TIMEOUT_MSEC'):
                        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, self.timeout * 1000)

                # Webcam Zoom/Teams yoki boshqa dastur tomonidan vaqtincha
                # band bo‘lishi mumkin. Avvalgi kod ochilmagan VideoCapture
                # obyektini saqlab qolardi; qurilma keyin bo‘shasa ham u hech
                # qachon qayta ochilmas, natijada qora ekran qolardi.
                if cap is not None and not cap.isOpened():
                    cap.release()
                    cap = None
                    failure_delay = min(2.0, failure_delay + 0.2)
                    self._error_count += 1
                    self._last_error = "Webcam yoki video oqimini ochib bo'lmadi; qayta urinilmoqda"
                    time.sleep(max(0.5, failure_delay))
                    continue

                if cap is not None:
                    success, frame = cap.read()
                    if success and frame is not None:
                        self._set_frame(frame)
                        failure_delay = 0.1
                        continue
                    cap.release()
                    cap = None
                    failure_delay = min(1.0, failure_delay + 0.1)
                    self._error_count += 1
                    self._last_error = "Failed to read frame from capture"

                is_http = (
                    not self.stream_url.strip().isdigit()
                    and (
                        self.stream_url.lower().startswith('http://')
                        or self.stream_url.lower().startswith('https://')
                    )
                )
                if is_http:
                    result = CameraService()._capture_http_frame(
                        self.stream_url, timeout=self.timeout
                    )
                    if result.get('success') and result.get('frame') is not None:
                        self._set_frame(result['frame'])
                        failure_delay = 0.1
                        continue
                    else:
                        self._error_count += 1
                        self._last_error = result.get('error', 'HTTP capture failed')

                time.sleep(max(0.5, failure_delay))
            except Exception as exc:
                logger.warning('StreamHub error for %s: %s', self.stream_url, exc, exc_info=True)
                self._error_count += 1
                self._last_error = str(exc)
                if cap is not None:
                    cap.release()
                    cap = None
                time.sleep(1.0)
                continue

        if cap is not None:
            cap.release()


def _get_stream_hub(stream_url: str) -> CameraStreamHub:
    """Stream hub olish yoki yaratish."""
    stream_url = _normalize_stream_url(stream_url)
    with _STREAM_HUBS_LOCK:
        hub = _STREAM_HUBS.get(stream_url)
        if hub is None:
            hub = CameraStreamHub(stream_url)
            _STREAM_HUBS[stream_url] = hub
        return hub


def _release_stream_hub(stream_url: str) -> None:
    """Stream hubni ozod qilish."""
    with _STREAM_HUBS_LOCK:
        hub = _STREAM_HUBS.get(stream_url)
        if hub is None:
            return
        with hub._lock:
            if not hub._alive and hub._reference_count <= 0:
                del _STREAM_HUBS[stream_url]


class CameraService:
    """IP kamera va streamlar bilan ishlash uchun servis."""

    def __init__(self):
        logger.debug("CameraService loaded")

    def connect_camera_sync(
        self,
        ip_address: str,
        port: int = 80,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """ONVIF orqali kameraga ulanib stream URL olish."""
        if ONVIFCamera is None:
            return {
                "success": False,
                "error": "onvif paketi o'rnatilmagan. RTSP stream URL orqali ishlatish mumkin.",
            }

        try:
            user = username or getattr(settings, "ONVIF_DEFAULT_USERNAME", "admin")
            pwd = password or getattr(settings, "ONVIF_DEFAULT_PASSWORD", "admin")

            my_cam = ONVIFCamera(ip_address, port, user, pwd)
            media_service = my_cam.create_media_service()
            profiles = media_service.GetProfiles()

            if not profiles:
                raise ValueError(f"{ip_address}: profil topilmadi")

            main_profile = profiles[0]
            stream_setup = {
                "StreamSetup": {
                    "Stream": "RTP-Unicast",
                    "Transport": {"Protocol": "RTSP"},
                },
                "ProfileToken": main_profile.token,
            }
            stream_uri = media_service.GetStreamUri(stream_setup)
            resolution = getattr(main_profile.VideoEncoderConfiguration, "Resolution", None)

            return {
                "success": True,
                "ip_address": ip_address,
                "stream_url": stream_uri.Uri,
                "profile_token": main_profile.token,
                "resolution": f"{resolution.Width}x{resolution.Height}" if resolution else None,
            }
        except Exception as exc:
            logger.error("Camera connect error (%s): %s", ip_address, exc)
            return {"success": False, "error": str(exc)}

    async def connect_camera(
        self,
        ip_address: str,
        port: int = 80,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Asinxron kamera ulanish."""
        return self.connect_camera_sync(ip_address, port, username, password)

    def _is_http_stream_url(self, stream_url: str) -> bool:
        """HTTP stream URL ekanligini tekshirish."""
        return stream_url.lower().startswith('http://') or stream_url.lower().startswith('https://')

    def _http_stream_url_candidates(self, stream_url: str) -> List[str]:
        """HTTP stream URL variantlarini yaratish."""
        candidates = [stream_url]
        if not self._is_http_stream_url(stream_url):
            return candidates

        parsed = urllib.parse.urlparse(stream_url)
        base_no_query = urllib.parse.urlunparse(parsed._replace(query=''))
        path = parsed.path or ''
        candidates.append(base_no_query)

        if path.endswith('/video'):
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path + '.mjpg')))
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path[:-len('/video')] + '/video.mjpg')))
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path + '.cgi')))
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path + '?dummy=1')))
        elif path.endswith('/video.mjpg'):
            candidates.append(stream_url.rstrip('/'))
        elif path.endswith('/video.cgi'):
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path[:-len('/video.cgi')] + '/video.mjpg')))
            candidates.append(urllib.parse.urlunparse(parsed._replace(path=path[:-len('/video.cgi')] + '/video')))
        elif path.endswith('/mjpeg'):
            candidates.append(stream_url.rstrip('/') + '/video.mjpg')
            candidates.append(stream_url.rstrip('/') + '/video')
        else:
            candidates.append(stream_url.rstrip('/') + '/video.mjpg')
            candidates.append(stream_url.rstrip('/') + '/video')
            candidates.append(stream_url.rstrip('/') + '/mjpeg')
            candidates.append(stream_url.rstrip('/') + '/video.cgi')
            candidates.append(stream_url.rstrip('/') + '/snapshot.jpg')

        return list(dict.fromkeys(candidates))

    def _capture_http_frame(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """HTTP streamdan kadr olish."""
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; CameraProbe/1.0)',
            'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
        }

        for candidate in self._http_stream_url_candidates(stream_url):
            try:
                request = urllib.request.Request(candidate, headers=headers)
                context = ssl.create_default_context()
                with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                    content_type = response.getheader('Content-Type', '') or ''
                    if 'text/html' in content_type.lower():
                        logger.debug('HTTP stream candidate returned HTML: %s', candidate)
                        continue

                    if 'image/jpeg' in content_type.lower() and 'multipart' not in content_type.lower():
                        data = response.read()
                        arr = np.frombuffer(data, dtype=np.uint8)
                        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                        if frame is not None and frame.size > 0:
                            height, width = frame.shape[:2]
                            return {
                                'success': True,
                                'frame': frame,
                                'resolution': f'{width}x{height}',
                            }
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
                            jpeg = buffer[start:end + 2]
                            arr = np.frombuffer(jpeg, dtype=np.uint8)
                            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                            if frame is None or frame.size == 0:
                                buffer = buffer[end + 2:]
                                continue
                            height, width = frame.shape[:2]
                            return {
                                'success': True,
                                'frame': frame,
                                'resolution': f'{width}x{height}',
                            }
                        if len(buffer) > 10 * 1024 * 1024:
                            buffer = buffer[-2 * 1024 * 1024:]
            except Exception as exc:
                logger.debug('HTTP stream capture failed for %s: %s', candidate, exc)
                continue

        return {'success': False, 'error': 'HTTP streamdan kadr olinmadi'}

    def _test_http_stream_sync(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """HTTP streamni test qilish."""
        result = self._capture_http_frame(stream_url, timeout)
        if result.get('success'):
            return {'success': True, 'status': 'online', 'resolution': result.get('resolution')}
        return {'success': False, 'status': 'offline', 'error': result.get('error')}

    def test_camera_stream_sync(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Kamera stream ishlayotganini tekshiradi."""
        if not stream_url:
            return {
                "success": False,
                "status": "offline",
                "error": "Stream URL kiritilmagan",
            }

        cap = None
        try:
            cv2_src = CameraStreamHub._cv2_source(stream_url)
            cap = cv2.VideoCapture(cv2_src)
            if hasattr(cv2, "CAP_PROP_BUFFERSIZE"):
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout * 1000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout * 1000)

            if not cap.isOpened():
                if self._is_http_stream_url(stream_url):
                    return self._test_http_stream_sync(stream_url, timeout)
                return {
                    "success": False,
                    "status": "offline",
                    "error": "Video oqimini ochib bo'lmadi",
                }

            ret, frame = cap.read()
            if not ret or frame is None:
                if self._is_http_stream_url(stream_url):
                    return self._test_http_stream_sync(stream_url, timeout)
                return {
                    "success": False,
                    "status": "offline",
                    "error": "Kadrni o'qib bo'lmadi",
                }

            height, width = frame.shape[:2]
            return {
                "success": True,
                "status": "online",
                "resolution": f"{width}x{height}",
            }
        except Exception as exc:
            logger.error("Stream test error: %s", exc, exc_info=True)
            return {"success": False, "status": "offline", "error": str(exc)}
        finally:
            if cap is not None:
                cap.release()

    async def test_camera_stream(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Asinxron stream test."""
        return self.test_camera_stream_sync(stream_url, timeout)

    def get_stream_hub(self, stream_url: str) -> CameraStreamHub:
        """Stream hub olish."""
        return _get_stream_hub(stream_url)

    def start_camera_stream(self, camera: Camera, persistent: bool = True) -> bool:
        """Kamera streamini boshlash."""
        if not camera or not camera.is_active or not camera.stream_url:
            return False
        hub = self.get_stream_hub(camera.stream_url)
        hub.start(persistent=persistent)
        return True

    def start_active_camera_streams(self, location_id: Optional[int] = None, persistent: bool = True) -> int:
        """Aktiv kameralar streamini boshlash."""
        query = Camera.objects.filter(is_active=True).exclude(stream_url__isnull=True).exclude(stream_url__exact='')
        if location_id:
            query = query.filter(location_id=location_id)

        stream_urls = list(query.order_by('stream_url').values_list('stream_url', flat=True).distinct())
        for stream_url in stream_urls:
            hub = self.get_stream_hub(stream_url)
            hub.start(persistent=persistent)
        return len(stream_urls)

    def stop_camera_stream(self, stream_url: str) -> bool:
        """Kamera streamini to'xtatish."""
        if not stream_url:
            return False
        if Camera.objects.filter(stream_url=stream_url, is_active=True).exists():
            return False
        with _STREAM_HUBS_LOCK:
            hub = _STREAM_HUBS.get(stream_url)
        if hub is None:
            return False
        hub.stop()
        with _STREAM_HUBS_LOCK:
            _STREAM_HUBS.pop(stream_url, None)
        return True

    def capture_frame(self, stream_url: str, timeout: int = 5) -> Dict[str, Any]:
        """Streamdan bitta kadr oladi va yagona ulanishni qayta ishlashadi."""
        if not stream_url:
            return {"success": False, "error": "Stream URL kiritilmagan"}

        hub = self.get_stream_hub(stream_url)
        hub.add_reference()
        try:
            frame = hub.get_frame(timeout)
            if frame is not None:
                height, width = frame.shape[:2]
                return {
                    "success": True,
                    "frame": frame,
                    "resolution": f"{width}x{height}",
                }

            if not stream_url.strip().isdigit() and self._is_http_stream_url(stream_url):
                return self._capture_http_frame(stream_url, timeout)

            return {"success": False, "error": "Kamera streamiga ulanib bo'lmadi"}
        except Exception as exc:
            logger.error("Frame capture error: %s", exc, exc_info=True)
            return {"success": False, "error": str(exc)}
        finally:
            hub.release_reference()

    async def update_camera_statuses(self, location_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Barcha aktiv kameralar holatini tekshiradi."""
        query = Camera.objects.filter(is_active=True)
        if location_id:
            query = query.filter(location_id=location_id)

        results: List[Dict[str, Any]] = []
        for camera in query.order_by("id"):
            status_info = self.test_camera_stream_sync(camera.stream_url or "")
            results.append(
                {
                    "id": camera.id,
                    "name": camera.name,
                    "location_id": camera.location_id,
                    "status": status_info.get("status", "offline"),
                    "error": status_info.get("error"),
                }
            )

        return results

    def get_active_cameras_list(self, location_id: int) -> List[Dict[str, Any]]:
        """Lokatsiya bo'yicha faol kameralar ro'yxatini qaytaradi."""
        return list(
            Camera.objects.filter(location_id=location_id, is_active=True).values(
                "id",
                "name",
                "ip_address",
                "stream_url",
                "camera_type",
                "fps",
                "resolution",
            )
        )

    def get_all_stream_hubs_status(self) -> Dict[str, Any]:
        """Barcha stream hublarning holatini qaytarish."""
        with _STREAM_HUBS_LOCK:
            hubs_status = {}
            for url, hub in _STREAM_HUBS.items():
                hubs_status[url] = hub.get_status()
            return {
                "total_hubs": len(hubs_status),
                "active_hubs": sum(1 for s in hubs_status.values() if s["alive"]),
                "hubs": hubs_status,
            }

    def cleanup_inactive_hubs(self) -> int:
        """Faol bo'lmagan hublarni tozalash."""
        cleaned = 0
        with _STREAM_HUBS_LOCK:
            to_remove = []
            for url, hub in _STREAM_HUBS.items():
                status = hub.get_status()
                if not status["alive"] and status["reference_count"] <= 0:
                    to_remove.append(url)
            for url in to_remove:
                del _STREAM_HUBS[url]
                cleaned += 1
        return cleaned
