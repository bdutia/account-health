import type {
  CsvDataMode,
  SecHostCoverageMatrixJobProgressEvent,
  SecHostCoverageMatrixScoreCardResult,
  SecHostCoverageMatrixSummaryJobProgressEvent,
  SecHostCoverageMatrixSummaryResult,
} from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startSecHostCoverageMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start security host coverage matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToSecHostCoverageMatrixJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: SecHostCoverageMatrixJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as SecHostCoverageMatrixJobProgressEvent
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

export async function startSecHostCoverageMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start security host coverage matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToSecHostCoverageMatrixSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: SecHostCoverageMatrixSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as SecHostCoverageMatrixSummaryJobProgressEvent
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
export async function fetchSecHostCoverageMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<SecHostCoverageMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch security host coverage matrix summary: ${response.status}`)
  }
  return (await response.json()) as SecHostCoverageMatrixSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchSecHostCoverageMatrixScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<SecHostCoverageMatrixScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch security host coverage matrix scoreCard: ${response.status}`)
  }
  return (await response.json()) as SecHostCoverageMatrixScoreCardResult
}
