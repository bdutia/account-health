import type { SecurityFeatureChartsJobProgressEvent } from '../types/dashboard'
import { runJobWithRetry } from './sseJobClient'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export interface SecurityFeatureChartsParams {
  startDate: string
  endDate: string
  accountName: string
}

export async function startSecurityFeatureChartsJob(
  accountKey: string,
  params: SecurityFeatureChartsParams,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/account/${accountKey}/securityFeatureCharts/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_date: params.startDate,
      end_date: params.endDate,
      account_name: params.accountName,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to start security feature charts job: ${response.status}`)
  }

  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

export function runSecurityFeatureChartsJob(
  accountKey: string,
  params: SecurityFeatureChartsParams,
  onEvent: (event: SecurityFeatureChartsJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<SecurityFeatureChartsJobProgressEvent>({
    startJob: () => startSecurityFeatureChartsJob(accountKey, params),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/dashboard/account/${accountKey}/securityFeatureCharts/jobs/${jobId}/events`,
    onEvent,
  })
}
