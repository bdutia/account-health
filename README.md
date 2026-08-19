# account-health

Two-page internal dashboard for stakeholder review:

- Summary page with KPI strip, account list, and risk/opportunity panels.
- Account detail page with deep dive metrics, highlights, recommended actions, and operational pillars.

## Stack

- React + TypeScript + Vite
- Python + FastAPI backend
- Tailwind CSS
- React Router

## Run Locally

```bash
npm install
npm run dev
```

Run frontend and backend together:

```bash
npm run dev:full
```

Run backend only:

```bash
npm run server:dev
```

Install Python dependencies (first time only):

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

To use the backend API (recommended), copy `.env.example` to `.env` and set:

- `VITE_APP_BASE_PATH=/` (local dev)
- `VITE_DASHBOARD_DATA_MODE=backend`
- `VITE_API_BASE_URL=http://localhost:4000`

Then copy `.env.server.example` to `.env.server` and configure backend credentials.

Backend runtime settings are read by the container at startup from environment variables. For repo-local testing, keep them in `.env.server`; for GSAP or another deployment platform, the same variable names can be injected by the runtime team.

For Akamai hostname coverage PoC, also set in `.env.server`:

- `EDGE_RC_SECTION` (for example `default`)
- `EDGE_RC_PATH` (optional, defaults to `~/.edgerc`)
- `AKAMAI_ACCOUNT_MAP_PATH` (defaults to `backend/account_id_map.json`)

Create `backend/account_id_map.json` from `backend/account_id_map.example.json` and map your account key to Akamai account ID.

For NetStorage-backed CSV access, also set in `.env.server`:

- `NS_HOSTNAME`
- `NS_KEYNAME`
- `NS_KEY`
- `NS_CP_CODE`
- `NS_BASE_PATH`

For live Core Web Vitals lookups used by the perf matrix endpoints, also set in `.env.server`:

- `CRUX_API_KEY`

For prefixed cloud hosting (example `/account-health`), set:

- `.env`: `VITE_APP_BASE_PATH=/account-health/`
- `.env`: `VITE_API_BASE_URL=/account-health/api`
- `.env.server`: `APP_BASE_PATH=/account-health`

To use live Google data directly from browser (not recommended for internal secrets), copy `.env.example` to `.env` and set:

- `VITE_DASHBOARD_DATA_MODE=google`
- `VITE_GOOGLE_API_KEY`
- `VITE_GOOGLE_SHEETS_SPREADSHEET_ID`

App routes:

- `/` summary page
- `/account/:accountId` account detail page

PoC backend route:

- `/api/dashboard/account/{accountKey}/hostname-coverage` returns dynamic covered/not-covered hostname data from Akamai APIs.

## Build

```bash
npm run build
npm run preview
```

## Docker (Cloud Deploy)

Build the image:

```bash
docker build --build-arg VITE_APP_BASE_PATH=/account-health -t account-health:latest .
```

Run it locally with backend env vars loaded from `.env.server`:

```bash
docker run --rm -p 4000:4000 --env-file .env.server -e APP_BASE_PATH=/account-health account-health:latest
```

Example: Google-backed runtime mode:

```bash
docker run --rm -p 4000:4000 \
	--env-file .env.server \
	-e APP_BASE_PATH=/account-health \
	-e SERVER_DATA_MODE=google \
	account-health:latest
```

Example: NetStorage-backed CSV runtime mode:

```bash
docker run --rm -p 4000:4000 \
	--env-file .env.server \
	-e APP_BASE_PATH=/account-health \
	-e SERVER_DATA_MODE=csv_data_remote \
	account-health:latest
```

The image expects secrets and integration settings at runtime, not at build time. Common runtime variables are:

- `APP_BASE_PATH`
- `SERVER_DATA_MODE`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `CRUX_API_KEY`
- `NS_HOSTNAME`
- `NS_KEYNAME`
- `NS_KEY`
- `NS_CP_CODE`
- `NS_BASE_PATH`

Then open:

- `http://localhost:4000/account-health`

## Project Structure

- `src/pages` route-level pages
- `src/components` reusable dashboard UI blocks
- `src/data/mockData.ts` starter mock dataset
- `src/types/dashboard.ts` shared interfaces
- `src/services/googleData.ts` data access seam for future integrations
- `backend/main.py` FastAPI server
- `backend/data_service.py` server-side Google Sheets/Docs loading
- `backend/mock_data.py` backend fallback dataset

## Replacing Mock Data With Google Sheets/Docs

The app supports both:

- Backend API integration via `backend/data_service.py` using Google service account credentials.
- Browser-side Google integration via `src/services/googleData.ts`.

Use these tab schemas (header row required):

1. `SummaryMetrics`:
	`id,title,value,subtitle,tone` (`SummaryMetrics!A:E`)
2. `Accounts`:
	`accountId,name,healthScore,healthTone,renewalRisk,expansionPotential,technicalMaturity,deliveryHealth,execAttention`
3. `SummaryPanels`:
	`panelId,panelTitle,itemId,label,value,tone`
4. `AccountDetails`:
	`accountId,name,owner,quarter`
5. `AccountHeroMetrics`:
	`accountId,id,title,value,subtitle,tone` (`AccountHeroMetrics!A:F`)
6. `AccountHighlights`:
	`accountId,itemId,label,value,tone,docId`
7. `AccountActions`:
	`accountId,itemId,label,value,tone,docId`
8. `AccountPillars`:
	`accountId,pillarId,pillarTitle,itemId,label,value,tone,displayOrder`

Notes:

- `tone` values should be: `healthy`, `watch`, `risk`, or `neutral`.
- `docId` is optional; when provided, the Google Doc text overrides the sheet value.
- If Google config is missing or the API fails, the UI automatically falls back to mock data.
