import type { AccountDetail, AccountMappingEntry, SummaryDashboardData } from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}api`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

type NsSource = 'netstorage-live' | 'netstorage-archive' | 'netstorage-error'

interface NsResponse<T> {
  source: NsSource
  context?: string | null
  data: T
  error?: string
}

export interface NsResult<T> {
  data: T | null
  source: NsSource
  context: string | null
  error?: string
}

function buildContextQuery(archiveContext?: string): string {
  if (!archiveContext) {
    return ''
  }
  const params = new URLSearchParams({ context: archiveContext })
  return `?${params.toString()}`
}

function getApiBase(): string {
  const rawBase = import.meta.env.VITE_APP_BASE_PATH ?? '/'
  // Strip any trailing slash so we don't get "//" or a missing "/" before "api"
  const normalizedBase = rawBase.replace(/\/+$/, '')
  return `${normalizedBase}/api`
}

const API_BASE = getApiBase()

/** LIVE by default; pass an archive context (e.g. "archive/20260819") to load that snapshot instead. */
export async function fetchNsSummaryDashboardData(archiveContext?: string): Promise<NsResult<SummaryDashboardData>> {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard/ns/summary${buildContextQuery(archiveContext)}`)
    const payload = (await response.json()) as NsResponse<SummaryDashboardData | null>
    return { data: payload.data, source: payload.source, context: payload.context ?? null, error: payload.error }
  } catch (error) {
    return { data: null, source: 'netstorage-error', context: archiveContext ?? null, error: String(error) }
  }
}

/** LIVE by default; pass an archive context (e.g. "archive/20260819") to load that snapshot instead. */
export async function fetchNsAccountDashboardData(
  accountId: string,
  archiveContext?: string,
): Promise<NsResult<AccountDetail>> {
  try {
    const response = await fetch(
      `${API_BASE}/api/dashboard/ns/account/${accountId}${buildContextQuery(archiveContext)}`,
    )
    const payload = (await response.json()) as NsResponse<AccountDetail | null>
    return { data: payload.data, source: payload.source, context: payload.context ?? null, error: payload.error }
  } catch (error) {
    return { data: null, source: 'netstorage-error', context: archiveContext ?? null, error: String(error) }
  }
}

/** Always LIVE: populates the account search/dropdown widget from account_mapping.json. */
export async function fetchAccountMapping(): Promise<AccountMappingEntry[]> {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard/ns/account-mapping`)
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as NsResponse<AccountMappingEntry[]>
    return payload.data ?? []
  } catch {
    return []
  }
}
