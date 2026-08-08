import type { JobProgressEvent } from '../types/dashboard'

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
