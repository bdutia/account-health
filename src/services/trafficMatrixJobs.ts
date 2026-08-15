import type {
  CsvDataMode,
  TrafficMatrixJobProgressEvent,
  TrafficMatrixScoreCardResult,
  TrafficMatrixSummaryJobProgressEvent,
  TrafficMatrixSummaryResult,
} from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startTrafficMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start traffic matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToTrafficMatrixJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: TrafficMatrixJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as TrafficMatrixJobProgressEvent
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

export async function startTrafficMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start traffic matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToTrafficMatrixSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: TrafficMatrixSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as TrafficMatrixSummaryJobProgressEvent
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
export async function fetchTrafficMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<TrafficMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch traffic matrix summary: ${response.status}`)
  }
  return (await response.json()) as TrafficMatrixSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchTrafficMatrixScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<TrafficMatrixScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch traffic matrix scoreCard: ${response.status}`)
  }
  return (await response.json()) as TrafficMatrixScoreCardResult
}
