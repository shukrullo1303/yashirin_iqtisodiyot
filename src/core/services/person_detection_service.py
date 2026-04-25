import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from django.conf import settings

try:
    import onnxruntime as ort
except ImportError:  # pragma: no cover - optional dependency
    ort = None

logger = logging.getLogger(__name__)


class PersonDetectionService:
    """Kadrlardagi odamlarni aniqlash va sodda tracking qilish servisi."""

    def __init__(self):
        from django.conf import settings as _settings
        from pathlib import Path as _Path
        _default = str(_Path(_settings.BASE_DIR).parent / "models" / "yolov8n.onnx")
        self.model_path = getattr(_settings, "PERSON_DETECTION_MODEL", _default)
        self.confidence_threshold = getattr(settings, "DETECTION_CONFIDENCE", 0.35)
        self.session = None
        self.input_name = None
        self.output_names = None
        self._next_track_id = 1
        self._load_model()

    def _load_model(self):
        """ONNX model mavjud bo‘lsa yuklaydi, bo‘lmasa OpenCV fallback ishlatadi."""
        if ort is None:
            logger.warning("onnxruntime topilmadi, OpenCV fallback ishlatiladi")
            return

        try:
            model_file = Path(self.model_path)
            if model_file.exists():
                self.session = ort.InferenceSession(str(model_file), providers=["CPUExecutionProvider"])
                self.input_name = self.session.get_inputs()[0].name
                self.output_names = [output.name for output in self.session.get_outputs()]
                logger.info("Person detection model loaded: %s", self.model_path)
            else:
                logger.warning("Detection model not found: %s. OpenCV fallback used.", self.model_path)
        except Exception as exc:
            logger.error("Model load error: %s", exc, exc_info=True)
            self.session = None

    async def detect_persons(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        return self.detect_persons_sync(frame)

    def detect_persons_sync(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Kadrdan odamlarni topadi."""
        if frame is None or frame.size == 0:
            return []

        if self.session is not None:
            try:
                input_size = (640, 640)
                height, width = frame.shape[:2]
                resized = cv2.resize(frame, input_size)
                input_blob = cv2.dnn.blobFromImage(
                    resized, 1.0 / 255.0, input_size, swapRB=True, crop=False
                )
                outputs = self.session.run(self.output_names, {self.input_name: input_blob})
                detections = self._process_outputs(outputs[0], width, height, input_size)
                if detections:
                    return detections
            except Exception as exc:
                logger.error("Detection error, switching to OpenCV fallback: %s", exc, exc_info=True)

        return self._detect_with_opencv_sync(frame)

    def _process_outputs(
        self,
        outputs: np.ndarray,
        orig_w: int,
        orig_h: int,
        input_size: tuple[int, int],
    ) -> List[Dict[str, Any]]:
        detections: List[Dict[str, Any]] = []
        output = np.squeeze(outputs).T

        for row in output:
            if len(row) < 5:
                continue

            score = float(row[4])
            if score < self.confidence_threshold:
                continue

            cx, cy, width, height = row[:4]
            x1 = max(0, int((cx - width / 2) * orig_w / input_size[0]))
            y1 = max(0, int((cy - height / 2) * orig_h / input_size[1]))
            x2 = min(orig_w, int((cx + width / 2) * orig_w / input_size[0]))
            y2 = min(orig_h, int((cy + height / 2) * orig_h / input_size[1]))

            detections.append(
                {
                    "bbox": [x1, y1, x2, y2],
                    "confidence": score,
                    "label": "person",
                }
            )

        return detections

    def _detect_with_opencv_sync(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """OpenCV HOG fallback."""
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

        boxes, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(8, 8), scale=1.05)

        detections: List[Dict[str, Any]] = []
        for (x, y, w, h), weight in zip(boxes, weights):
            score = float(weight)
            if score < self.confidence_threshold:
                continue

            detections.append(
                {
                    "bbox": [int(x), int(y), int(x + w), int(y + h)],
                    "confidence": score,
                    "label": "person",
                }
            )
        return detections

    async def track_persons(
        self,
        frame: np.ndarray,
        previous_detections: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        current_detections = self.detect_persons_sync(frame)
        return self.assign_track_ids(current_detections, previous_detections or [])

    def assign_track_ids(
        self,
        current_detections: List[Dict[str, Any]],
        previous_detections: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Oldingi bbox'lar bilan IOU asosida sodda tracking ID biriktiradi."""
        available_previous = previous_detections.copy()

        for detection in current_detections:
            best_match = None
            best_iou = 0.0

            for previous in available_previous:
                iou = self.calculate_iou(detection["bbox"], previous.get("bbox", []))
                if iou > best_iou:
                    best_iou = iou
                    best_match = previous

            if best_match and best_iou >= 0.3:
                detection["track_id"] = best_match.get("track_id")
                available_previous.remove(best_match)
            else:
                detection["track_id"] = self._next_track_id
                self._next_track_id += 1

        return current_detections

    def calculate_iou(self, box1: List[int], box2: List[int]) -> float:
        """Intersection over Union hisoblash."""
        if len(box1) != 4 or len(box2) != 4:
            return 0.0

        x1_1, y1_1, x1_2, y1_2 = box1
        x2_1, y2_1, x2_2, y2_2 = box2

        x_left = max(x1_1, x2_1)
        y_top = max(y1_1, y2_1)
        x_right = min(x1_2, x2_2)
        y_bottom = min(y1_2, y2_2)

        if x_right <= x_left or y_bottom <= y_top:
            return 0.0

        intersection_area = (x_right - x_left) * (y_bottom - y_top)
        area1 = max(1, (x1_2 - x1_1) * (y1_2 - y1_1))
        area2 = max(1, (x2_2 - x2_1) * (y2_2 - y2_1))

        return intersection_area / float(area1 + area2 - intersection_area)