import cv2
import numpy as np
import onnxruntime as ort
import logging
from typing import List, Dict, Any
from pathlib import Path
from django.conf import settings

logger = logging.getLogger(__name__)

class PersonDetectionService:
    """Инсонларни аниқлаш сервиси (Django версия)"""
    
    def __init__(self):
        # Django settings.py да модел йўли ва конфиденциаллик даражасини белгилаш керак
        self.model_path = getattr(settings, 'PERSON_DETECTION_MODEL', 'models/yolov8n.onnx')
        self.confidence_threshold = getattr(settings, 'DETECTION_CONFIDENCE', 0.5)
        self.session = None
        self.input_name = None
        self.output_names = None
        
        self._load_model()

    def _load_model(self):
        """ONNX моделни юклаш"""
        try:
            model_file = Path(self.model_path)
            if model_file.exists():
                # CPU учун оптималлаштирилган провайдер
                self.session = ort.InferenceSession(
                    str(model_file),
                    providers=['CPUExecutionProvider']
                )
                self.input_name = self.session.get_inputs()[0].name
                self.output_names = [output.name for output in self.session.get_outputs()]
                logger.info(f"Person Detection модел юкланди: {self.model_path}")
            else:
                logger.warning(f"Модел топилмади: {self.model_path}. OpenCV fallback ишлатилади")
        except Exception as e:
            logger.error(f"Моделни юклашда хатолик: {e}")

    async def detect_persons(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Кадрда инсонларни аниқлаш"""
        if self.session is None:
            return await self._detect_with_opencv(frame)
        
        try:
            # Кадрни тайёрлаш (YOLO стандарт 640x640)
            input_size = (640, 640)
            h, w = frame.shape[:2]
            
            resized = cv2.resize(frame, input_size)
            # RGB форматга ўтказиш ва нормализация
            input_blob = cv2.dnn.blobFromImage(
                resized, 1.0 / 255.0, input_size, swapRB=True, crop=False
            )
            
            # Инференс (Model Prediction)
            outputs = self.session.run(self.output_names, {self.input_name: input_blob})
            
            # Натижаларни қайта ишлаш
            return self._process_outputs(outputs[0], w, h, input_size)
        
        except Exception as e:
            logger.error(f"Аниқлашда хатолик: {e}", exc_info=True)
            return await self._detect_with_opencv(frame)

    def _process_outputs(self, outputs: np.ndarray, orig_w: int, orig_h: int, input_size: tuple) -> List[Dict[str, Any]]:
        """YOLOv8 натижаларини Bounding Box форматга ўтказиш"""
        detections = []
        
        # YOLOv8 чиқиши одатда (1, 84, 8400) ёки шунга ўхшаш форматда бўлади
        # Уни трансформация қиламиз
        output = np.squeeze(outputs).T 
        
        for row in output:
            # Инсон класси (одатда 0-индекс)
            score = row[4] # YOLOv8 да 4-индексдан кейин классификация бошланади
            if score > self.confidence_threshold:
                # Марказий координаталардан бурчак координаталарига ўтиш
                cx, cy, width, height = row[:4]
                
                # Масштаблаш
                x1 = int((cx - width/2) * orig_w / input_size[0])
                y1 = int((cy - height/2) * orig_h / input_size[1])
                x2 = int((cx + width/2) * orig_w / input_size[0])
                y2 = int((cy + height/2) * orig_h / input_size[1])
                
                detections.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": float(score),
                    "label": "person"
                })
        
        return detections

    async def _detect_with_opencv(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """OpenCV HOG ёки Haar Cascade (Fallback учун энг содда усул)"""
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        
        boxes, weights = hog.detectMultiScale(frame, winStride=(8,8))
        
        detections = []
        for (x, y, w, h), weight in zip(boxes, weights):
            if weight > self.confidence_threshold:
                detections.append({
                    "bbox": [int(x), int(y), int(x+w), int(y+h)],
                    "confidence": float(weight),
                    "label": "person"
                })
        return detections

    def calculate_iou(self, box1: List[int], box2: List[int]) -> float:
        """Intersection over Union ҳисоблаш (Tracking учун керак)"""
        [x1_1, y1_1, x1_2, y1_2] = box1
        [x2_1, y2_1, x2_2, y2_2] = box2
        
        x_left = max(x1_1, x2_1)
        y_top = max(y1_1, y2_1)
        x_right = min(x1_2, x2_2)
        y_bottom = min(y1_2, y2_2)
        
        if x_right < x_left or y_bottom < y_top:
            return 0.0
            
        intersection_area = (x_right - x_left) * (y_bottom - y_top)
        area1 = (x1_2 - x1_1) * (y1_2 - y1_1)
        area2 = (x2_2 - x2_1) * (y2_2 - y2_1)
        
        return intersection_area / float(area1 + area2 - intersection_area)