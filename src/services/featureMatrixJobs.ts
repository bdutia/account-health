import type {
  CsvDataMode,
  FeatureMatrixJobProgressEvent,
  FeatureMatrixScoreCardResult,
  FeatureMatrixSummaryJobProgressEvent,
  FeatureMatrixSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const FEATURE_MATRIX_CSV_FILENAME = 'config-audit.csv'

export function getFeatureMatrixDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/download${query ? `?${query}` : ''}`
}

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startFeatureMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start feature matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runFeatureMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: FeatureMatrixJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<FeatureMatrixJobProgressEvent>({
    startJob: () => startFeatureMatrixJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/jobs/${jobId}/events`,
    onEvent,
  })
}

export async function startFeatureMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start feature matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runFeatureMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: FeatureMatrixSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<FeatureMatrixSummaryJobProgressEvent>({
    startJob: () => startFeatureMatrixSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/summary/jobs/${jobId}/events`,
    onEvent,
  })
}

// Synchronous fetch (no job/SSE wrapper) for other components that just need the summary JSON.
export async function fetchFeatureMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<FeatureMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch feature matrix summary: ${response.status}`)
  }
  return (await response.json()) as FeatureMatrixSummaryResult
}

// Synchronous fetch (no job/SSE wrapper) for the scoreCard JSON output widget.
export async function fetchFeatureMatrixScoreCard(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<FeatureMatrixScoreCardResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/featureMatrix/scoreCard?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch feature matrix scoreCard: ${response.status}`)
  }
  return (await response.json()) as FeatureMatrixScoreCardResult
}
