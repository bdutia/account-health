import type {
  CsvDataMode,
  PerfMatrixJobProgressEvent,
  PerfMatrixScoreCardResult,
  PerfMatrixSummaryJobProgressEvent,
  PerfMatrixSummaryResult,
} from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startPerfMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start perf matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToPerfMatrixJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: PerfMatrixJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as PerfMatrixJobProgressEvent
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

export async function startPerfMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start perf matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToPerfMatrixSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: PerfMatrixSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as PerfMatrixSummaryJobProgressEvent
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

// Synchronous fetch (no job/SSE wrapper) for other components that just need the summary JSON.
export async function fetchPerfMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<PerfMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch perf matrix summary: ${response.status}`)
  }
  return (await response.json()) as PerfMatrixSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchPerfMatrixScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<PerfMatrixScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrix/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch perf matrix scoreCard: ${response.status}`)
  }
  return (await response.json()) as PerfMatrixScoreCardResult
}
