import cv2
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view
import logging

logger = logging.getLogger(__name__)

def generate_mjpeg_stream(url):
    """Kameradan kadrlarni o'qib, MJPEG generatorini hosil qiladi"""
    cap = cv2.VideoCapture(url)
    # Kechikishni kamaytirish uchun buferni minimallashtiramiz
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    try:
        while True:
            success, frame = cap.read()
            if not success:
                break
            
            # Kadr o'lchamini optimallashtirish (640x480 yetarli)
            frame = cv2.resize(frame, (640, 480))
            
            # Tasvirni JPEG formatiga o'tkazish
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
            frame_bytes = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    finally:
        cap.release()

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