# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yashirin Iqtisodiyot** — an AI-powered camera surveillance and hidden-economy detection platform for Uzbek tax authorities. It tracks employees/customers via computer vision, compares real foot traffic against registered sales, and flags risk scores for tax inspectors.

## Commands

### Backend

```bash
# Run dev server
python3 manage.py runserver --settings=config.settings.local

# Apply migrations
python3 manage.py migrate --settings=config.settings.local

# Create superuser
python3 manage.py createsuperuser --settings=config.settings.local

# Download ONNX models (YuNet + SFace)
python3 manage.py download_models --settings=config.settings.local

# Run tests
python3 manage.py test --settings=config.settings.local

# Single test
python3 manage.py test src.core.tests.test_foo --settings=config.settings.local
```

Always pass `--settings=config.settings.local` for local development. Never use `config.settings.base` directly — it is incomplete (no `INSTALLED_APPS` for apps, no `AUTH_USER_MODEL`).

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
npm run build
npm run preview
```

Frontend proxies `/api` → `http://localhost:8000`.

## Architecture

### Request Flow

```
React (Vite, port 3000)
  → /api proxy
  → Django DRF (port 8000)
  → config/urls.py
  → src/api/main_routers.py   ← all URL registrations
  → src/api/views/…
  → src/core/services/…
  → src/core/models/…
```

### Settings Split

- `config/settings/base.py` — minimal Django defaults only
- `config/settings/local.py` — dev settings: adds `INSTALLED_APPS`, `AUTH_USER_MODEL`, CORS, `DATABASES`, AI config knobs
- `config/settings/production.py` — production overrides

### AI Pipeline (`src/core/services/`)

`AIService` is the orchestrator. On each frame it runs **person detection** (YOLOv8n ONNX) and **face detection+recognition** (YuNet + SFace ONNX) in parallel via `ThreadPoolExecutor`, then passes results to:
- `BehavioralAnalyticsService` — dwell time, movement patterns
- `RiskScoringService` — compares camera head count vs KKT receipts, emits `low/medium/high/critical`

`FaceDetectionVisualizationService` is the MJPEG streaming layer. It is instantiated **once per (stream_url, location_id)** via `_VIZ_SERVICES` cache in `camera_view.py` — do not move model loading into the per-frame path.

ONNX models live in `models/` (not committed). YuNet and SFace auto-download via `download_models` command; YOLOv8n must be placed manually.

### API Layer (`src/api/`)

- `main_routers.py` — single file registering all DRF routers and urlpatterns
- `views/` — split by domain: `auth/`, `cafe/`, `employee/`, `location/`, `analytics/`, `integration/`
- `serializer/` — one file per domain
- `src/shared/pagination.py` — `StandardPagination` (page size 50) used globally

### Auth & RBAC

Session-based auth (cookie). CSRF token fetched from `GET /api/auth/csrf/` before any mutating request. Roles: `admin`, `business_owner`, `tax_inspector`, `analyst`, `cafe_manager`, `waiter`, `kitchen`. Each view enforces role via `request.user.role` checks.

### Frontend (`frontend/src/`)

- Zustand: auth state only (`store/`)
- React Query: all server state (no direct axios in components)
- MUI v5 + Recharts + React Leaflet
- Role-based page structure: `pages/superadmin/`, `pages/owner/`, `pages/manager/`, `pages/waiter/`, `pages/kitchen/`
- `components/CameraStream.tsx` — renders MJPEG stream with live-stats overlay from `GET /api/cameras/stream/`

### Key Settings Knobs (local.py)

| Setting | Default | Effect |
|---|---|---|
| `EMPLOYEE_PRESENCE_THRESHOLD_SECONDS` | 1800 | Seconds in frame to classify as employee |
| `CAMERA_ANALYSIS_DURATION_SECONDS` | 15 | Per-request camera analysis window |
| `OPENCV_MODELS_DIR` | `models/` | ONNX model directory |
| `RISK_CALC_INTERVAL_SECONDS` | 300 | Risk score recalc interval per camera |

### Swagger

Available at `http://localhost:8000/swagger/` when running locally.
