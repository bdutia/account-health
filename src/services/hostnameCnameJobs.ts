import type {
  CsvDataMode,
  HostnameCnameMatrixJobProgressEvent,
  HostnameCnameMatrixSummaryJobProgressEvent,
  HostnameCnameMatrixSummaryResult,
} from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

export const HOST_MATRIX_CNAME_CSV_FILENAME = 'config-summary.csv'

export function getHostnameCnameMatrixDownloadUrl(accountKey: string, context?: string): string {
  const params = new URLSearchParams()
  if (context) {
    params.set('context', context)
  }
  const query = params.toString()
  return `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/download${query ? `?${query}` : ''}`
}

//const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}api`.replace(/\/$/, '')
//trying to fix: double api append from front end - vite build: 
const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startHostnameCnameMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start hostname CNAME matrix job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runHostnameCnameMatrixJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: HostnameCnameMatrixJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<HostnameCnameMatrixJobProgressEvent>({
    startJob: () => startHostnameCnameMatrixJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/jobs/${jobId}/events`,
    onEvent,
  })
}

export async function startHostnameCnameMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<string> {
  const params = new URLSearchParams({ data: dataMode })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/summary/jobs?${params.toString()}`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start hostname CNAME matrix summary job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runHostnameCnameMatrixSummaryJob(
  accountKey: string,
  dataMode: CsvDataMode,
  context: string | undefined,
  onEvent: (event: HostnameCnameMatrixSummaryJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<HostnameCnameMatrixSummaryJobProgressEvent>({
    startJob: () => startHostnameCnameMatrixSummaryJob(accountKey, dataMode, context),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/summary/jobs/${jobId}/events`,
    onEvent,
  })
}

// Synchronous fetch (no job/SSE wrapper) for other components that just need the summary JSON.
export async function fetchHostnameCnameMatrixSummary(
  accountKey: string,
  dataMode: CsvDataMode,
  context?: string,
): Promise<HostnameCnameMatrixSummaryResult> {
  const params = new URLSearchParams({ data: dataMode, jsonOut: 'true' })
  if (context) {
    params.set('context', context)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/summary?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch hostname CNAME matrix summary: ${response.status}`)
  }
  return (await response.json()) as HostnameCnameMatrixSummaryResult
}
