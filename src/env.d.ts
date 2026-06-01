/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE_PATH?: string
  readonly VITE_DASHBOARD_DATA_MODE?: 'mock' | 'google' | 'backend'
  readonly VITE_API_BASE_URL?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_SHEETS_SPREADSHEET_ID?: string
  readonly VITE_GOOGLE_SHEETS_SUMMARY_METRICS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNTS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_SUMMARY_PANELS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNT_DETAILS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNT_HERO_METRICS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNT_HIGHLIGHTS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNT_ACTIONS_RANGE?: string
  readonly VITE_GOOGLE_SHEETS_ACCOUNT_PILLARS_RANGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
