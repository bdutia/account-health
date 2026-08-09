import type {
  CsvDataMode,
  HostnameCnameMatrixJobProgressEvent,
  HostnameCnameMatrixSummaryJobProgressEvent,
  JobProgressEvent,
} from '../types/dashboard'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}api`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export async function startHostnameCnameCoverageJob(accountKey: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostname-cname-coverage/jobs`,
    { method: 'POST' },
  )
  if (!response.ok) {
    throw new Error(`Failed to start hostname CNAME coverage job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function subscribeToHostnameCnameCoverageJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: JobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostname-cname-coverage/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as JobProgressEvent
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

export function subscribeToHostnameCnameMatrixJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: HostnameCnameMatrixJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as HostnameCnameMatrixJobProgressEvent
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

export function subscribeToHostnameCnameMatrixSummaryJob(
  accountKey: string,
  jobId: string,
  onEvent: (event: HostnameCnameMatrixSummaryJobProgressEvent) => void,
): () => void {
  const source = new EventSource(
    `${API_BASE_URL}/api/dashboard/account/${accountKey}/hostMatrix/cname/summary/jobs/${jobId}/events`,
  )

  source.onmessage = (message) => {
    const event = JSON.parse(message.data) as HostnameCnameMatrixSummaryJobProgressEvent
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
