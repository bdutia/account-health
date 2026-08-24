import type {
  CsvDataMode,
  SecHostCoverageMatrixJobProgressEvent,
  SecHostCoverageMatrixScoreCardResult,
  SecHostCoverageMatrixSummaryJobProgressEvent,
  SecHostCoverageMatrixSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const SEC_HOST_COVERAGE_MATRIX_CSV_FILENAME = 'hostname-coverage.csv'

export function getSecHostCoverageMatrixDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/download${query ? `?${query}` : ''}`
}

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

export function runSecHostCoverageMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: SecHostCoverageMatrixJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<SecHostCoverageMatrixJobProgressEvent>({
    startJob: () => startSecHostCoverageMatrixJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/jobs/${jobId}/events`,
    onEvent,
  })
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

export function runSecHostCoverageMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: SecHostCoverageMatrixSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<SecHostCoverageMatrixSummaryJobProgressEvent>({
    startJob: () => startSecHostCoverageMatrixSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/secHostCoverageMatrix/summary/jobs/${jobId}/events`,
    onEvent,
  })
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
