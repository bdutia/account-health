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

## Build

```bash
npm run build
npm run preview
```

## Docker (Cloud Deploy)

Build and run locally with path prefix:

```bash
docker build --build-arg VITE_APP_BASE_PATH=/account-health/ -t account-health:latest .
docker run --rm -p 4000:4000 --env-file .env.server -e APP_BASE_PATH=/account-health account-health:latest
```

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
