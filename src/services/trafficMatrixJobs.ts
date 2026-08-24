import type {
  CsvDataMode,
  TrafficMatrixJobProgressEvent,
  TrafficMatrixScoreCardResult,
  TrafficMatrixSummaryJobProgressEvent,
  TrafficMatrixSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const TRAFFIC_MATRIX_CSV_FILENAME = 'traffic-report-hits-by-hostname.csv'

export function getTrafficMatrixDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/download${query ? `?${query}` : ''}`
}

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

export function runTrafficMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: TrafficMatrixJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<TrafficMatrixJobProgressEvent>({
    startJob: () => startTrafficMatrixJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/jobs/${jobId}/events`,
    onEvent,
  })
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

export function runTrafficMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: TrafficMatrixSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<TrafficMatrixSummaryJobProgressEvent>({
    startJob: () => startTrafficMatrixSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/trafficMatrix/summary/jobs/${jobId}/events`,
    onEvent,
  })
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
