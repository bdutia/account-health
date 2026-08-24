import type {
  CsvDataMode,
  PerfMatrixTopNJobProgressEvent,
  PerfMatrixTopNScoreCardResult,
  PerfMatrixTopNSummaryJobProgressEvent,
  PerfMatrixTopNSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const PERF_MATRIX_TOPN_CSV_FILENAME = 'traffic-report-hits-by-hostname.csv'

export function getPerfMatrixTopNDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/download${query ? `?${query}` : ''}`
}

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

export function runPerfMatrixTopNJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: PerfMatrixTopNJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<PerfMatrixTopNJobProgressEvent>({
    startJob: () => startPerfMatrixTopNJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/jobs/${jobId}/events`,
    onEvent,
  })
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

export function runPerfMatrixTopNSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: PerfMatrixTopNSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<PerfMatrixTopNSummaryJobProgressEvent>({
    startJob: () => startPerfMatrixTopNSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/perfMatrixTopN/summary/jobs/${jobId}/events`,
    onEvent,
  })
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
