"""
Management command: download all ONNX / cascade models needed by AI services.

Usage:
    python manage.py download_models
    python manage.py download_models --models yunet sface yolov8n
    python manage.py download_models --force   # re-download even if file exists

Models downloaded:
  yunet   — YuNet face detector  (opencv_zoo, ~350 KB)
  sface   — SFace face embedder  (opencv_zoo, ~38 MB)
  yolov8n — YOLOv8-nano person detector (Ultralytics, ~6 MB)
"""

import os
import pathlib
import urllib.request
import urllib.error

from django.conf import settings
from django.core.management.base import BaseCommand

# ── Model catalogue ────────────────────────────────────────────────────────────
MODELS = {
    "yunet": {
        "filename": "face_detection_yunet_2023mar.onnx",
        "url": (
            "https://github.com/opencv/opencv_zoo/raw/main/models/"
            "face_detection_yunet/face_detection_yunet_2023mar.onnx"
        ),
        "description": "YuNet face detector (OpenCV Zoo)",
    },
    "sface": {
        "filename": "face_recognition_sface_2021dec.onnx",
        "url": (
            "https://github.com/opencv/opencv_zoo/raw/main/models/"
            "face_recognition_sface/face_recognition_sface_2021dec.onnx"
        ),
        "description": "SFace face embedder (OpenCV Zoo)",
    },
    "yolov8n": {
        "filename": "yolov8n.onnx",
        "url": (
            "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.onnx"
        ),
        "description": "YOLOv8-nano person detector (Ultralytics)",
    },
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _models_dir() -> pathlib.Path:
    """Return the models directory, creating it if necessary."""
    d = pathlib.Path(getattr(settings, "OPENCV_MODELS_DIR", pathlib.Path(settings.BASE_DIR) / "models"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _download(url: str, dest: pathlib.Path, label: str, stdout) -> bool:
    """Download *url* to *dest* with a progress indicator. Returns True on success."""
    stdout.write(f"  Downloading {label} …")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk = 65536  # 64 KB
            with open(dest, "wb") as f:
                while True:
                    data = resp.read(chunk)
                    if not data:
                        break
                    f.write(data)
                    downloaded += len(data)
                    if total:
                        pct = downloaded * 100 // total
                        stdout.write(f"\r  Downloading {label} … {pct}%", ending="")
                        stdout.flush()
        stdout.write(f"\r  Downloading {label} … done ({downloaded // 1024} KB)   ")
        stdout.write("")
        return True
    except urllib.error.URLError as exc:
        stdout.write(f"\n  ERROR: {exc}")
        if dest.exists():
            dest.unlink()
        return False
    except Exception as exc:
        stdout.write(f"\n  ERROR: {exc}")
        if dest.exists():
            dest.unlink()
        return False


# ── Command ────────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = "Download ONNX / cascade model files for AI services."

    def add_arguments(self, parser):
        parser.add_argument(
            "--models",
            nargs="+",
            choices=list(MODELS.keys()),
            default=list(MODELS.keys()),
            metavar="MODEL",
            help=f"Which models to download. Choices: {', '.join(MODELS)}. Default: all.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-download even if the file already exists.",
        )

    def handle(self, *args, **options):
        target_keys = options["models"]
        force = options["force"]
        models_dir = _models_dir()

        self.stdout.write(self.style.SUCCESS(f"Models directory: {models_dir}"))
        self.stdout.write("")

        ok_count = 0
        skip_count = 0
        fail_count = 0

        for key in target_keys:
            meta = MODELS[key]
            dest = models_dir / meta["filename"]
            self.stdout.write(f"[{key}] {meta['description']}")
            self.stdout.write(f"  Target: {dest}")

            if dest.exists() and not force:
                size_kb = dest.stat().st_size // 1024
                self.stdout.write(
                    self.style.WARNING(f"  Already exists ({size_kb} KB). Use --force to re-download.")
                )
                skip_count += 1
                self.stdout.write("")
                continue

            success = _download(meta["url"], dest, key, self.stdout)
            if success:
                ok_count += 1
                self.stdout.write(self.style.SUCCESS(f"  Saved: {dest}"))
            else:
                fail_count += 1
                self.stdout.write(self.style.ERROR(f"  Failed: {key}"))
            self.stdout.write("")

        self.stdout.write("─" * 50)
        self.stdout.write(
            self.style.SUCCESS(f"Done: {ok_count} downloaded, {skip_count} skipped, {fail_count} failed.")
        )

        if fail_count:
            self.stdout.write(
                self.style.WARNING(
                    "Tip: If GitHub download fails, download manually and place in:\n"
                    f"  {models_dir}"
                )
            )
            for key in target_keys:
                meta = MODELS[key]
                dest = models_dir / meta["filename"]
                if not dest.exists():
                    self.stdout.write(f"  {meta['filename']}  ←  {meta['url']}")
