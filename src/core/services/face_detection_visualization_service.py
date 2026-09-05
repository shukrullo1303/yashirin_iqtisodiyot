import cv2
import numpy as np
import logging
import time
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, date
from django.utils import timezone

logger = logging.getLogger(__name__)


class FaceDetectionVisualizationService:
    """
    Yuzlarni aniqlash va vizualizatsiya qilish servisi.
    - YuNet+SFace bilan yuzlarni taniydi
    - Sariq to'rtburchaklar chizadi
    - Xodim ismlarini ko'rsatadi (agar bazada bo'lsa)
    - Mijozlarni sanab boradi
    """

    # Ranglar (BGR format)
    YELLOW = (0, 220, 255)   # Sariq - operator ko'radigan aniqlangan odam
    BLUE   = (230, 100, 0)   # Ko'k   - eski oqimlar bilan moslik uchun
    WHITE  = (255, 255, 255)
    BLACK  = (0, 0, 0)
    GREEN  = (0, 200, 0)     # (unused, kept for compatibility)

    def __init__(self, location_id: int):
        self.location_id = location_id

        # In-memory cache (tez kirish uchun) — DB dan yuklangan
        self._seen_today: set = set()   # bugungi kun uchun signaturalar seti
        self._cache_date: str = ''      # qaysi kun uchun yuklangan

        # Oxirgi kadrdan aniqlangan bboxlar — intermediate kadrlarda qayta chizish uchun
        self._last_face_data: List[Dict[str, Any]] = []
        self._last_person_data: List[Dict[str, Any]] = []
        self._last_person_detection_at = 0.0

        # Face recognition service'ni import qilish
        self._face_service = None
        self._person_service = None
        self._models_loaded = False
        self._try_load_models()
        self._load_today_from_db()

        logger.info(f"FaceDetectionVisualizationService initialized for location {location_id}")

    def _try_load_models(self):
        """Face recognition modellarini yuklashga harakat qilish."""
        try:
            from src.core.services.face_recognition_service import FaceRecognitionService
            self._face_service = FaceRecognitionService()
            self._models_loaded = True
            logger.info("Face recognition models loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load face recognition models: {e}")
            self._models_loaded = False
        try:
            from src.core.services.person_detection_service import PersonDetectionService
            self._person_service = PersonDetectionService()
        except Exception as e:
            logger.warning(f"Could not load person detector: {e}")

    def _load_today_from_db(self):
        """Bugungi kuzatilgan mijozlarni DB dan in-memory cache ga yuklash."""
        today_str = date.today().isoformat()
        try:
            from src.core.models.customer import TrackedCustomer
            sigs = TrackedCustomer.objects.filter(
                location_id=self.location_id,
                date_str=today_str,
            ).values_list('signature', flat=True)
            self._seen_today = set(sigs)
            self._cache_date = today_str
            logger.info(f"Loaded {len(self._seen_today)} tracked customers from DB for {today_str}")
        except Exception as e:
            logger.warning(f"Could not load tracked customers from DB: {e}")
            self._seen_today = set()
            self._cache_date = today_str

    def process_frame(
        self,
        frame: np.ndarray,
        location_id: Optional[int] = None,
        timestamp: Optional[datetime] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Kadrni qayta ishlash: yuzlarni aniqlash, taniish va chizish.
        """
        if location_id is None:
            location_id = self.location_id
        if timestamp is None:
            timestamp = timezone.now()

        if frame is None or frame.size == 0:
            return frame, {"error": "Empty frame"}

        # 1. Yuzlarni aniqlash
        faces = self._detect_faces(frame)
        logger.debug(f"Detected {len(faces)} faces in frame")

        # 2. Har bir yuzni taniish va ma'lumotlarni yig'ish
        face_data = []
        for i, face in enumerate(faces):
            bbox = face.get("bbox")
            if bbox is None:
                continue

            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

            # Ensure bbox is within frame bounds
            h, w = frame.shape[:2]
            x1 = max(0, min(x1, w - 1))
            y1 = max(0, min(y1, h - 1))
            x2 = max(0, min(x2, w - 1))
            y2 = max(0, min(y2, h - 1))

            # Crop face region
            crop = frame[y1:y2, x1:x2]

            if crop.size == 0:
                continue

            # Yuzni taniish (agar model yuklangan bo'lsa)
            display_name = None
            is_employee = False

            if self._models_loaded and self._face_service:
                try:
                    identity = self._face_service.recognize_face_sync(
                        crop, location_id, embedding=face.get("embedding")
                    )

                    if identity.get("is_employee"):
                        # Ism lokatsiya bo'yicha xodimlar bazasidan olinadi.
                        # "Xodim" prefiksi operatorga mijoz bilan adashmaslikka yordam beradi.
                        display_name = f"Xodim: {identity.get('employee_name') or 'Noma’lum'}"
                        is_employee = True
                        logger.debug(f"Employee recognized: {display_name}")
                except Exception as e:
                    logger.debug(f"Face recognition failed: {e}")

            # Agar xodim topilmasa, mijoz deb belgilash
            if not display_name:
                signature = self._get_face_signature(crop) if self._models_loaded else None
                if signature:
                    # Texnik signature operatorga ko‘rsatilmaydi: u kadrdan
                    # kadrga almashib, mijozni boshqa odamdek ko‘rsatishi mumkin.
                    display_name = "Mijoz"
                    self._track_customer(signature, location_id, timestamp)

            face_data.append({
                "bbox": (x1, y1, x2, y2),
                "display_name": display_name,
                "is_employee": is_employee,
            })

        # Yuz yo‘q bo‘lsa ham operator kadrda odam borligini ko‘rsin.
        # Person detector 0.8 soniyada bir marta ishlaydi; oraliq kadrlarda
        # oxirgi ramka chiziladi, shuning uchun jonli tasvir sekinlashmaydi.
        if not face_data:
            face_data = self._detect_person_data(frame)

        # 3. Kadrda chizish
        self._last_face_data = face_data
        annotated_frame = self._draw_face_boxes(frame, face_data)

        # 4. Statistika
        stats = {
            "location_id": location_id,
            "timestamp": timestamp.isoformat(),
            "total_faces": len(face_data),
            "employees_detected": sum(1 for f in face_data if f["is_employee"]),
            "customers_detected": sum(1 for f in face_data if not f["is_employee"]),
            "daily_customers": self.get_daily_customers(timestamp.date().isoformat()),
        }

        # 5. Statistika yozuvini kadr ustiga qo'shish
        annotated_frame = self._draw_stats(annotated_frame, stats)

        return annotated_frame, stats

    def _detect_person_data(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self._person_service is None:
            return []
        now = time.monotonic()
        if now - self._last_person_detection_at < 0.8:
            return self._last_person_data
        self._last_person_detection_at = now
        try:
            h, w = frame.shape[:2]
            data = []
            for person in self._person_service.detect_persons_sync(frame)[:5]:
                bbox = person.get("bbox", [])
                if len(bbox) != 4:
                    continue
                x1, y1, x2, y2 = bbox
                x1, y1 = max(0, min(int(x1), w - 1)), max(0, min(int(y1), h - 1))
                x2, y2 = max(0, min(int(x2), w - 1)), max(0, min(int(y2), h - 1))
                if x2 <= x1 or y2 <= y1:
                    continue
                data.append({"bbox": (x1, y1, x2, y2), "display_name": "Anonim odam", "is_employee": False})
            self._last_person_data = data
            return data
        except Exception as e:
            logger.debug(f"Person visualization failed: {e}")
            return self._last_person_data

    def _detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Yuzlarni aniqlash (YuNet yoki Haar Cascade)."""
        if self._models_loaded and self._face_service:
            try:
                return self._face_service.detect_faces(frame)
            except Exception as e:
                logger.debug(f"YuNet detection failed: {e}")

        # Fallback: Haar Cascade
        return self._detect_faces_haar(frame)

    def _detect_faces_haar(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Haar Cascade bilan yuzlarni aniqlash."""
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            face_cascade = cv2.CascadeClassifier(cascade_path)

            if face_cascade.empty():
                logger.warning("Haar cascade not loaded")
                return []

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))

            results = []
            for (x, y, w, h) in faces:
                results.append({
                    "bbox": [int(x), int(y), int(x + w), int(y + h)],
                    "confidence": 1.0,
                    "label": "face",
                    "embedding": None,
                })
            return results
        except Exception as e:
            logger.debug(f"Haar detection failed: {e}")
            return []

    def _get_face_signature(self, face_image: np.ndarray) -> Optional[str]:
        """Yuz uchun unikal signature olish."""
        if self._models_loaded and self._face_service:
            try:
                return self._face_service.get_face_signature(face_image)
            except Exception:
                pass
        return None

    def draw_cached_boxes(self, frame: np.ndarray) -> np.ndarray:
        """Oxirgi aniqlangan bboxlarni yangi kadrga chizish (qayta detection qilmasdan)."""
        if not self._last_face_data:
            return frame
        return self._draw_face_boxes(frame, self._last_face_data)

    def _draw_face_boxes(
        self,
        frame: np.ndarray,
        face_data: List[Dict[str, Any]]
    ) -> np.ndarray:
        """Yuzlar atrofida sariq to'rtburchaklar va ismlarni chizish."""
        annotated = frame.copy()

        for face in face_data:
            x1, y1, x2, y2 = face["bbox"]
            display_name = face["display_name"]
            is_employee = face["is_employee"]

            # Ensure coordinates are valid
            if x2 <= x1 or y2 <= y1:
                continue

            # Xodim ham jonli ekranda sariq ramka bilan ajralib turadi;
            # uning yozuvida esa "Xodim: Ism familiya" doim ko'rinadi.
            color = self.YELLOW

            # Sariq/yashil to'rtburchak chizish (2px qalinlikda)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Ism yoki "Odam" yozuvini doim ko'rsatish.
            if not display_name:
                display_name = "Odam"
            if display_name:
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.6
                thickness = 2

                # Yozuv o'lchamini hisoblash
                (text_width, text_height), baseline = cv2.getTextSize(
                    display_name, font, font_scale, thickness
                )

                # Fon to'rtburchak chizish (qora)
                top_left = (x1, max(0, y1 - text_height - baseline - 5))
                bottom_right = (x1 + text_width, y1)
                cv2.rectangle(
                    annotated,
                    top_left,
                    bottom_right,
                    self.BLACK,
                    cv2.FILLED,
                )

                # Ismni yozish (oq rangda)
                cv2.putText(
                    annotated,
                    display_name,
                    (x1, max(baseline + 2, y1 - baseline - 2)),
                    font,
                    font_scale,
                    self.WHITE,
                    thickness,
                )

        return annotated

    def _draw_stats(
        self,
        frame: np.ndarray,
        stats: Dict[str, Any],
    ) -> np.ndarray:
        """Pastki o'ng burchakda chiroyli stat overlay chizish."""
        h, w = frame.shape[:2]

        employees = stats.get('employees_detected', 0)
        customers = stats.get('customers_detected', 0)

        font       = cv2.FONT_HERSHEY_SIMPLEX
        fscale     = 0.62
        thickness  = 2
        pad_x, pad_y = 14, 10
        line_gap   = 8

        # Har bir satr o'lchami
        def text_size(txt):
            (tw, th), bl = cv2.getTextSize(txt, font, fscale, thickness)
            return tw, th + bl

        dot_r = 7   # coloured circle radius

        rows = [
            {'dot': self.BLUE,   'text': f'Xodimlar:  {employees} ta'},
            {'dot': self.YELLOW, 'text': f'Mijozlar:  {customers} ta'},
        ]

        row_sizes = [text_size(r['text']) for r in rows]
        box_w = max(tw for tw, _ in row_sizes) + 2 * pad_x + dot_r * 2 + 8
        row_h = max(th for _, th in row_sizes)
        box_h = len(rows) * row_h + (len(rows) - 1) * line_gap + 2 * pad_y

        x1 = w - box_w - 10
        y1 = h - box_h - 10
        x2, y2 = w - 10, h - 10

        # Semi-transparent dark background
        overlay = frame.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (20, 20, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)

        # Border line
        cv2.rectangle(frame, (x1, y1), (x2, y2), (80, 80, 80), 1)

        for i, row in enumerate(rows):
            cy = y1 + pad_y + i * (row_h + line_gap) + row_h // 2
            tx = x1 + pad_x

            # Coloured filled circle
            cv2.circle(frame, (tx + dot_r, cy), dot_r, row['dot'], cv2.FILLED)
            cv2.circle(frame, (tx + dot_r, cy), dot_r, (255, 255, 255), 1)

            # Text
            ty = cy + row_h // 2 - 2
            cv2.putText(
                frame, row['text'],
                (tx + dot_r * 2 + 8, ty),
                font, fscale, (255, 255, 255), thickness, cv2.LINE_AA,
            )

        return frame

    def _track_customer(
        self,
        signature: str,
        location_id: int,
        timestamp: datetime,
    ):
        """Mijozni kuzatish: in-memory cache + DB upsert (24 soat+ saqlanadi)."""
        today_str = timestamp.date().isoformat()

        # Kun o'zgarganda cache yangilanadi
        if self._cache_date != today_str:
            self._seen_today = set()
            self._cache_date = today_str

        is_new = signature not in self._seen_today
        self._seen_today.add(signature)

        try:
            from src.core.models.customer import TrackedCustomer
            obj, created = TrackedCustomer.objects.get_or_create(
                signature=signature,
                location_id=location_id,
                date_str=today_str,
                defaults={
                    'first_seen': timestamp,
                    'last_seen': timestamp,
                    'visit_count': 1,
                },
            )
            if not created:
                obj.last_seen = timestamp
                obj.visit_count += 1
                obj.save(update_fields=['last_seen', 'visit_count'])
        except Exception as e:
            logger.debug(f"TrackedCustomer DB upsert failed: {e}")

    def get_daily_customers(self, date_str: Optional[str] = None) -> int:
        """Kunlik noyob mijozlar soni (DB dan)."""
        if date_str is None:
            date_str = date.today().isoformat()

        # Bugun uchun in-memory cache ishlatiladi
        if date_str == self._cache_date:
            return len(self._seen_today)

        try:
            from src.core.models.customer import TrackedCustomer
            return TrackedCustomer.objects.filter(
                location_id=self.location_id,
                date_str=date_str,
            ).count()
        except Exception:
            return 0

    def get_tracked_faces_summary(self) -> Dict[str, Any]:
        """Kuzatilayotgan yuzlar xulosasi."""
        today_str = date.today().isoformat()
        try:
            from src.core.models.customer import TrackedCustomer
            rows = TrackedCustomer.objects.filter(
                location_id=self.location_id,
                date_str=today_str,
            ).values('signature', 'first_seen', 'last_seen', 'visit_count')
            tracked = {
                r['signature']: {
                    'first_seen': r['first_seen'].isoformat(),
                    'last_seen': r['last_seen'].isoformat(),
                    'visit_count': r['visit_count'],
                }
                for r in rows
            }
        except Exception:
            tracked = {}

        return {
            "location_id": self.location_id,
            "date": today_str,
            "total_tracked_faces": len(tracked),
            "daily_customers": self.get_daily_customers(today_str),
            "tracked_faces": tracked,
        }

    def reset_daily_count(self):
        """Kunlik hisobni tozalash (faqat xotira, DB ta'sirlanmaydi)."""
        self._seen_today.clear()

    def get_frame_with_detections(
        self,
        frame: np.ndarray,
        location_id: Optional[int] = None,
    ) -> np.ndarray:
        """Faqat kadrni qayta ishlash va chizilgan variantni qaytarish."""
        annotated_frame, _ = self.process_frame(frame, location_id)
        return annotated_frame
