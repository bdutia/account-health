import type {
  CsvDataMode,
  WsaAlertMatrixJobProgressEvent,
  WsaAlertMatrixScoreCardResult,
  WsaAlertMatrixSummaryJobProgressEvent,
  WsaAlertMatrixSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const WSA_ALERT_MATRIX_CSV_FILENAME = 'wsa-alerts.csv'

export function getWsaAlertMatrixDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/download${query ? `?${query}` : ''}`
}

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startWsaAlertMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start WSA Alert matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runWsaAlertMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: WsaAlertMatrixJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<WsaAlertMatrixJobProgressEvent>({
    startJob: () => startWsaAlertMatrixJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/jobs/${jobId}/events`,
    onEvent,
  })
}

export async function startWsaAlertMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start WSA Alert matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runWsaAlertMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: WsaAlertMatrixSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<WsaAlertMatrixSummaryJobProgressEvent>({
    startJob: () => startWsaAlertMatrixSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/summary/jobs/${jobId}/events`,
    onEvent,
  })
}

// Synchronous fetch (no job/SSE wrapper) for components that need the summary JSON directly.
export async function fetchWsaAlertMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<WsaAlertMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch WSA Alert matrix summary: ${response.status}`)
  }
  return (await response.json()) as WsaAlertMatrixSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchWsaAlertMatrixScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<WsaAlertMatrixScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch WSA Alert matrix scoreCard: ${response.status}`)
  }
  return (await response.json()) as WsaAlertMatrixScoreCardResult
}
