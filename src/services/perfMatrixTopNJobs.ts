import type {
  CsvDataMode,
  PerfMatrixTopNJobProgressEvent,
  PerfMatrixTopNScoreCardResult,
  PerfMatrixTopNSummaryJobProgressEvent,
  PerfMatrixTopNSummaryResult,
} from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startPerfMatrixTopNJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start perf matrix (Top N) job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToPerfMatrixTopNJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: PerfMatrixTopNJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as PerfMatrixTopNJobProgressEvent
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

export async function startPerfMatrixTopNSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start perf matrix (Top N) summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToPerfMatrixTopNSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: PerfMatrixTopNSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as PerfMatrixTopNSummaryJobProgressEvent
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
export async function fetchPerfMatrixTopNSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<PerfMatrixTopNSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch perf matrix (Top N) summary: ${response.status}`)
  }
  return (await response.json()) as PerfMatrixTopNSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchPerfMatrixTopNScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<PerfMatrixTopNScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch perf matrix (Top N) scoreCard: ${response.status}`)
  }
  return (await response.json()) as PerfMatrixTopNScoreCardResult
}
