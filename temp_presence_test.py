from src.core.services.face_recognition_service import FaceRecognitionService
from django.utils import timezone
import datetime

s = FaceRecognitionService()

sig = 'testsig3'
loc = 1

t = timezone.now()
p = s.update_face_presence(sig, loc, t)
print('p1', p)

for i in range(1, 6):
    t = t + datetime.timedelta(minutes=4)
    p = s.update_face_presence(sig, loc, t)
    print('p', i, p)
