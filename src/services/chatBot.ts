import type { ChatGreetingResult, ChatJobProgressEvent } from '../types/chat'
import { runJobWithRetry } from './sseJobClient'

const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

export function createChatSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function startGreetingJob(
  accountId: string,
  sessionId: string,
  token: string,
  archive?: string,
): Promise<string> {
  const params = new URLSearchParams({ sessionId })
  if (archive) {
    params.set('context', archive)
  }
  const response = await fetch(
    `${API_BASE_URL}/api/chat/account/${accountId}/greeting/jobs?${params.toString()}`,
    { method: 'POST', headers: authHeaders(token) },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Failed to start chat greeting job: ${response.status}`)
  }
  const payload = (await response.json()) as { jobId: string }
  return payload.jobId
}

/** Runs the greeting job (downloads + summarizes the account's NetStorage report, asks Gemini)
 * and streams progress/result events. Returns a cancel function. */
export function runChatGreetingJob(
  accountId: string,
  sessionId: string,
  token: string,
  archive: string | undefined,
  onEvent: (event: ChatJobProgressEvent) => void,
): () => void {
  return runJobWithRetry<ChatJobProgressEvent>({
    startJob: () => startGreetingJob(accountId, sessionId, token, archive),
    buildEventsUrl: (jobId) =>
      `${API_BASE_URL}/api/chat/account/${accountId}/greeting/jobs/${jobId}/events?token=${encodeURIComponent(token)}`,
    onEvent,
  })
}

export async function sendChatMessage(
  accountId: string,
  sessionId: string,
  message: string,
  token: string,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/chat/account/${accountId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ sessionId, message }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.detail ?? `Chat message failed: ${response.status}`)
  }
  return (payload as { reply: string }).reply
}

export async function uploadChatFile(
  accountId: string,
  sessionId: string,
  file: File,
  token: string,
): Promise<{ reply: string; fileName: string }> {
  const formData = new FormData()
  formData.append('sessionId', sessionId)
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/chat/account/${accountId}/upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.detail ?? `File upload failed: ${response.status}`)
  }
  return payload as { reply: string; fileName: string }
}

export type { ChatGreetingResult }
