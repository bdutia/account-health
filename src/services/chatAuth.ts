import type { StoredChatSession } from '../types/chat'

const SESSION_STORAGE_KEY = 'account-health:chatSession'
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function getApiBase(): string {
  const rawBase = import.meta.env.VITE_APP_BASE_PATH ?? '/'
  const normalizedBase = rawBase.replace(/\/+$/, '')
  return `${normalizedBase}/api`
}

const API_BASE = getApiBase()

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''
}

/** Injects the Google Identity Services script exactly once and resolves when it's ready. */
let gsiScriptPromise: Promise<void> | null = null
export function loadGoogleIdentityScript(): Promise<void> {
  if (gsiScriptPromise) {
    return gsiScriptPromise
  }
  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })
  return gsiScriptPromise
}

export function getStoredChatSession(): StoredChatSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as StoredChatSession
  } catch {
    return null
  }
}

export function storeChatSession(session: StoredChatSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearChatSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

/** Sends the Google ID token credential to the backend for verification (akamai.com domain only). */
export async function verifyGoogleCredential(credential: string): Promise<StoredChatSession> {
  const response = await fetch(`${API_BASE}/chat/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  const payload = (await response.json().catch(() => null)) as
    | { token: string; email: string; name: string }
    | { detail: string }
    | null

  if (!response.ok || !payload || !('token' in payload)) {
    const detail = payload && 'detail' in payload ? payload.detail : `Sign-in failed (${response.status})`
    throw new Error(detail)
  }

  const session: StoredChatSession = { token: payload.token, email: payload.email, name: payload.name }
  storeChatSession(session)
  return session
}
