from config.settings.base import *

# Kunlik tashriflar Asaka mahalliy vaqti bo'yicha 00:00–24:00 hisoblanadi.
TIME_ZONE = 'Asia/Tashkent'

import os

BASE_DIR = BASE_DIR.parent

# Debug toolbar va runserver uchun
INTERNAL_IPS = ["127.0.0.1", "::1"]

# MySQL yo‘q bo‘lsa: $env:USE_SQLITE="1" (PowerShell) yoki export USE_SQLITE=1
if os.environ.get("USE_SQLITE", "").lower() in ("1", "true", "yes"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
}

# Frontend (3000) ↔ API (8000) sessiya cookie
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False

EXTERNAL_APPS = [
    'rest_framework',
    'drf_yasg',
    "debug_toolbar",
    "corsheaders",
]

LOCAL_APPS = ["src.core"]

INSTALLED_APPS += EXTERNAL_APPS + LOCAL_APPS

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
}

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]

INTERNAL_IPS = ["127.0.0.1", "::1"]

SECRET_KEY = "secret-key-for-local-development"
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
CSRF_TRUSTED_ORIGINS = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'debug_toolbar.middleware.DebugToolbarMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Kamera oldida yuz: shu vaqtdan kam = mijoz, ko‘p = potentsial xodim (sekundda). Masalan: 10800 = 3 soat.
EMPLOYEE_PRESENCE_THRESHOLD_SECONDS = 7200

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',          # (admin.W411) uchun
                'django.contrib.auth.context_processors.auth',          # (admin.E402) uchun
                'django.contrib.messages.context_processors.messages',  # (admin.E404) uchun
            ],
        },
    },
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_USER_MODEL = 'core.User'

# Integration API keys (set real values in production via env vars or secrets)
TAX_API_KEY = os.environ.get('TAX_API_KEY', '')
TAX_API_URL = os.environ.get('TAX_API_URL', 'http://localhost')
MYGOV_API_KEY = os.environ.get('MYGOV_API_KEY', '')
MYGOV_API_URL = os.environ.get('MYGOV_API_URL', 'http://localhost')
KKT_API_KEY = os.environ.get('KKT_API_KEY', '')
KKT_API_URL = os.environ.get('KKT_API_URL', 'http://localhost')

# ONNX model paths (auto-downloaded on first use for YuNet/SFace; YOLOv8n needs manual download or run_models command)
import pathlib as _pathlib
OPENCV_MODELS_DIR = str(_pathlib.Path(BASE_DIR) / 'models')
PERSON_DETECTION_MODEL = str(_pathlib.Path(BASE_DIR) / 'models' / 'yolov8n.onnx')

# AI analysis: run for 15 seconds per request (was 60s — too slow for HTTP)
CAMERA_ANALYSIS_DURATION_SECONDS = 15

# Face detection: kamera oldida 30 daqiqa = potentsial xodim (test uchun 1800s)
EMPLOYEE_PRESENCE_THRESHOLD_SECONDS = 1800

# Visitor monitoring works continuously while Django is running.  Biometric
# snapshots and face vectors are automatically erased after 24 hours.
VISITOR_MONITOR_ENABLED = True
# 1 soniyalik tekshiruv: kirish/chiqish 2–3 soniyada qayd qilinishi uchun.
VISITOR_MONITOR_INTERVAL_SECONDS = 1
VISITOR_MONITOR_CAPTURE_WORKERS = 4
VISITOR_LONG_STAY_MINUTES = 180
VISITOR_BIOMETRIC_RETENTION_HOURS = 24
VISITOR_FACE_MATCH_THRESHOLD = 0.40
# Same-camera partial-face continuity and a conservative exit fallback when
# exactly one person is currently marked inside a location.
VISITOR_TRACK_FACE_MATCH_THRESHOLD = 0.24
# New entry is registered sooner; short-lived tracking prevents duplicate IDs.
VISITOR_NEW_FACE_CONFIDENCE = 0.55
# Chiqish kamerasi ko'pincha yon tomon/harakatdagi yuzni ko'radi. Lokatsiyada
# faqat bitta ochiq tashrif bo'lsa, shu yuzni yopish uchun yumshoqroq chegara.
# Bir nechta ochiq odam bo'lsa bu qoida ishlamaydi.
VISITOR_SINGLE_OPEN_EXIT_THRESHOLD = 0.18

# Risk panelidagi tushum ssenariysi (rasmiy soliq hisob-kitobi emas). Haqiqiy
# o'rtacha chek va stavka ma'lum bo'lsa, superadmin ushbu qiymatlarni muhit
# o'zgaruvchilari orqali almashtirishi mumkin.
RISK_AVERAGE_TICKET = float(os.environ.get('RISK_AVERAGE_TICKET', '40000'))
RISK_REFERENCE_TAX_RATE = float(os.environ.get('RISK_REFERENCE_TAX_RATE', '0.12'))

# In-memory cache for face encodings and presence tracking
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "yashirin-cache",
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PAGINATION_CLASS": "src.shared.pagination.StandardPagination",
    "PAGE_SIZE": 50,
}
