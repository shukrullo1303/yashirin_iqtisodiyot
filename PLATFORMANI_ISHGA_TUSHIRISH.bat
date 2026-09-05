@echo off
setlocal EnableExtensions
title Asaka tumani raqamli iqtisodiyot - ishga tushirish

REM Bu faylni ikki marta bosing. Backend va frontend alohida, kichraytirilgan
REM oynalarda ishga tushadi. Oynalarni yopish platformani to'xtatadi.
set "PROJECT_ROOT=%~dp0"
set "PYTHON_EXE=%PROJECT_ROOT%venv\Scripts\python.exe"
set "QGIS_ENV=C:\Program Files\QGIS 3.44.7\bin\o4w_env.bat"

if not exist "%PYTHON_EXE%" (
  echo XATO: Python muhiti topilmadi: %PYTHON_EXE%
  pause
  exit /b 1
)

if not exist "%QGIS_ENV%" (
  echo XATO: QGIS Python muhiti topilmadi: %QGIS_ENV%
  pause
  exit /b 1
)

if not exist "%PROJECT_ROOT%frontend\package.json" (
  echo XATO: frontend\package.json topilmadi.
  pause
  exit /b 1
)

echo Backend ishga tushirilmoqda...
start "Asaka AI - Backend" /min cmd.exe /k "call "%QGIS_ENV%" ^&^& cd /d "%PROJECT_ROOT%" ^&^& "%PYTHON_EXE%" manage.py runserver 0.0.0.0:8000 --settings=config.settings.local --noreload"

echo Frontend ishga tushirilmoqda...
start "Asaka AI - Frontend" /min cmd.exe /k "cd /d "%PROJECT_ROOT%frontend" ^&^& npm run dev -- --host 0.0.0.0"

echo.
echo Platforma tayyorlanmoqda. Brauzer bir necha soniyada ochiladi.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/"

echo Tayyor: http://localhost:3000/
echo Backend API: http://127.0.0.1:8000/api/
timeout /t 2 /nobreak >nul
exit /b 0
