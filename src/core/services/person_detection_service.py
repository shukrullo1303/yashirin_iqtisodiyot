"""
Инсонларни аниқлаш сервиси
Computer Vision - Person Detection
"""
import cv2
import numpy as np
import onnxruntime as ort
from typing import List, Dict, Any, Optional
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class PersonDetectionService:
    """Инсонларни аниқлаш сервиси"""
    
    def __init__(self):
        """Инициализация"""
        self.model_path = settings.PERSON_DETECTION_MODEL
        self.confidence_threshold = settings.DETECTION_CONFIDENCE
        self.session = None
        self.input_name = None
        self.output_names = None
        
        # Моделни юклаш
        self._load_model()
    
    def _load_model(self):
        """ONNX моделни юклаш"""
        try:
            if Path(self.model_path).exists():
                self.session = ort.InferenceSession(
                    self.model_path,
                    providers=['CPUExecutionProvider']
                )
                self.input_name = self.session.get_inputs()[0].name
                self.output_names = [output.name for output in self.session.get_outputs()]
                logger.info(f"Person Detection модел юкланди: {self.model_path}")
            else:
                logger.warning(f"Модел топилмади: {self.model_path}. YOLOv8 fallback ишлатилади")
                self.session = None
        except Exception as e:
            logger.error(f"Моделни юклашда хатолик: {e}")
            self.session = None
    
    async def detect_persons(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Кадрда инсонларни аниқлаш
        """
        if self.session is None:
            # Fallback: OpenCV DNN
            return await self._detect_with_opencv(frame)
        
        try:
            # Кадрни тайёрлаш
            input_size = (640, 640)
            resized = cv2.resize(frame, input_size)
            input_blob = cv2.dnn.blobFromImage(
                resized,
                1.0 / 255.0,
                input_size,
                swapRB=True,
                crop=False
            )
            
            # Инференс
            outputs = self.session.run(
                self.output_names,
                {self.input_name: input_blob}
            )
            
            # Натижаларни қайта ишлаш
            detections = self._process_outputs(
                outputs[0],
                frame.shape[1],
                frame.shape[0],
                input_size
            )
            
            return detections
        
        except Exception as e:
            logger.error(f"Аниқлашда хатолик: {e}", exc_info=True)
            return await self._detect_with_opencv(frame)
    
    async def _detect_with_opencv(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """OpenCV DNN билан аниқлаш (fallback)"""
        try:
            # YOLOv4-tiny модел (fallback)
            net = cv2.dnn.readNetFromDarknet(
                "yolov4-tiny.cfg",
                "yolov4-tiny.weights"
            )
            
            blob = cv2.dnn.blobFromImage(
                frame,
                1.0 / 255.0,
                (416, 416),
                swapRB=True,
                crop=False
            )
            
            net.setInput(blob)
            outputs = net.forward(net.getUnconnectedOutLayersNames())
            
            detections = []
            h, w = frame.shape[:2]
            
            for output in outputs:
                for detection in output:
                    scores = detection[5:]
                    class_id = np.argmax(scores)
                    confidence = scores[class_id]
                    
                    # Фақат инсонлар (class_id = 0)
                    if class_id == 0 and confidence > self.confidence_threshold:
                        center_x = int(detection[0] * w)
                        center_y = int(detection[1] * h)
                        width = int(detection[2] * w)
                        height = int(detection[3] * h)
                        
                        x = int(center_x - width / 2)
                        y = int(center_y - height / 2)
                        
                        detections.append({
                            "bbox": [x, y, x + width, y + height],
                            "confidence": float(confidence),
                            "face_bbox": None  # Face detection алохида
                        })
            
            return detections
        
        except Exception as e:
            logger.warning(f"OpenCV DNN аниқлашда хатолик: {e}")
            return []
    
    def _process_outputs(
        self,
        outputs: np.ndarray,
        orig_w: int,
        orig_h: int,
        input_size: tuple
    ) -> List[Dict[str, Any]]:
        """Модел натижаларини қайта ишлаш"""
        detections = []
        
        # YOLO форматда натижалар
        boxes = outputs[:, :4]
        scores = outputs[:, 4]
        classes = outputs[:, 5]
        
        # Фақат инсонлар (class 0)
        person_indices = np.where(classes == 0)[0]
        
        for idx in person_indices:
            if scores[idx] > self.confidence_threshold:
                # Бокс координаталарини масштаблаш
                x1, y1, x2, y2 = boxes[idx]
                x1 = int(x1 * orig_w / input_size[0])
                y1 = int(y1 * orig_h / input_size[1])
                x2 = int(x2 * orig_w / input_size[0])
                y2 = int(y2 * orig_h / input_size[1])
                
                detections.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": float(scores[idx]),
                    "face_bbox": None  # Face detection алохида ишлайди
                })
        
        return detections
    
    async def track_persons(
        self,
        frame: np.ndarray,
        previous_detections: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Инсонларни кузатиш (tracking)
        Re-identification учун
        """
        # Бошқа кадрдаги детекциялар
        current_detections = await self.detect_persons(frame)
        
        # Simple tracking (IOU-based)
        tracked = []
        used_indices = set()
        
        for prev_det in previous_detections:
            best_match = None
            best_iou = 0.0
            
            for idx, curr_det in enumerate(current_detections):
                if idx in used_indices:
                    continue
                
                iou = self._calculate_iou(
                    prev_det["bbox"],
                    curr_det["bbox"]
                )
                
                if iou > best_iou and iou > 0.3:  # IOU threshold
                    best_iou = iou
                    best_match = idx
            
            if best_match is not None:
                used_indices.add(best_match)
                tracked.append({
                    **current_detections[best_match],
                    "track_id": prev_det.get("track_id", len(tracked))
                })
        
        # Янги детекциялар
        for idx, det in enumerate(current_detections):
            if idx not in used_indices:
                tracked.append({
                    **det,
                    "track_id": len(tracked)
                })
        
        return tracked
    
    def _calculate_iou(self, box1: List[int], box2: List[int]) -> float:
        """Intersection over Union (IOU) ҳисоблаш"""
        x1_min, y1_min, x1_max, y1_max = box1
        x2_min, y2_min, x2_max, y2_max = box2
        
        # Intersection
        inter_x_min = max(x1_min, x2_min)
        inter_y_min = max(y1_min, y2_min)
        inter_x_max = min(x1_max, x2_max)
        inter_y_max = min(y1_max, y2_max)
        
        if inter_x_max < inter_x_min or inter_y_max < inter_y_min:
            return 0.0
        
        inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
        
        # Union
        box1_area = (x1_max - x1_min) * (y1_max - y1_min)
        box2_area = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = box1_area + box2_area - inter_area
        
        if union_area == 0:
            return 0.0
        
        return inter_area / union_area
