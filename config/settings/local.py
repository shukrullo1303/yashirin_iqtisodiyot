from config.settings.base import *

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

# AI analysis: run for 15 seconds per request (was 60s — too slow for HTTP)
CAMERA_ANALYSIS_DURATION_SECONDS = 15

# Face detection: kamera oldida 30 daqiqa = potentsial xodim (test uchun 1800s)
EMPLOYEE_PRESENCE_THRESHOLD_SECONDS = 1800

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