from config.settings.base import *

import os

BASE_DIR = BASE_DIR.parent

EXTERNAL_APPS = [
    'rest_framework', 
    'drf_yasg',
    "debug_toolbar",
]

LOCAL_APPS = ["src.core"]

INSTALLED_APPS += EXTERNAL_APPS + LOCAL_APPS

SECRET_KEY = "secret-key-for-local-development"
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
CSRF_TRUSTED_ORIGINS = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
]

MIDDLEWARE = [
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
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'yashirin_iqtisodiyot',          # MySQL Workbench-da ochgan schema nomi
        'USER': 'root',               # MySQL foydalanuvchi nomi
        'PASSWORD': 'Admin.7700', # O'rnatishda qo'ygan parolingiz
        'HOST': '127.0.0.1',          # Lokal kompyuter uchun
        'PORT': '3306',               # Standart MySQL porti
    }
}

AUTH_USER_MODEL = 'core.User'