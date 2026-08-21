import type {
  CsvDataMode,
  WsaAlertMatrixJobProgressEvent,
  WsaAlertMatrixScoreCardResult,
  WsaAlertMatrixSummaryJobProgressEvent,
  WsaAlertMatrixSummaryResult,
} from '../types/dashboard'

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

export function subscribeToWsaAlertMatrixJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: WsaAlertMatrixJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as WsaAlertMatrixJobProgressEvent
    onEvent(event)
    if (event.type === 'completed' || event.type === 'failed') {
      source.close()
    }
  }

  source.onerror = () => {
    source.close()
  }

  return () => source.close()
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

export function subscribeToWsaAlertMatrixSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: WsaAlertMatrixSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/wsaAlertMatrix/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as WsaAlertMatrixSummaryJobProgressEvent
    onEvent(event)
    if (event.type === 'completed' || event.type === 'failed') {
      source.close()
    }
  }

  source.onerror = () => {
    source.close()
  }

  return () => source.close()
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
