import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatJobProgressEvent, ChatTurn, StoredChatSession } from '../types/chat'
import {
  clearChatSession,
  getGoogleClientId,
  getStoredChatSession,
  loadGoogleIdentityScript,
  verifyGoogleCredential,
} from '../services/chatAuth'
import { createChatSessionId, runChatGreetingJob, sendChatMessage, uploadChatFile } from '../services/chatBot'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const ACCEPTED_UPLOAD_EXTENSIONS = '.xlsx,.xlsm,.csv,.json,.txt,.md,.log'

interface AiChatBotProps {
  accountId: string
  archive?: string
}

let turnIdCounter = 0
function nextTurnId(): string {
  turnIdCounter += 1
  return `turn-${turnIdCounter}`
}

export function AiChatBot({ accountId, archive }: AiChatBotProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<StoredChatSession | null>(() => getStoredChatSession())
  const [authError, setAuthError] = useState<string | null>(null)
  const [greetingStatus, setGreetingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const signInButtonRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const greetingRequestedRef = useRef(false)
  const cancelJobRef = useRef<(() => void) | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-derive a fresh session id per account
  const sessionId = useMemo(() => createChatSessionId(), [accountId])
  const googleClientId = getGoogleClientId()

  // Reset per-account chat state whenever the account changes.
  useEffect(() => {
    greetingRequestedRef.current = false
    setGreetingStatus('idle')
    setMessages([])
    setProgressMessage('')
    return () => {
      cancelJobRef.current?.()
      cancelJobRef.current = null
    }
  }, [accountId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, progressMessage])

  // Render the Google Sign-In button once the panel is open and the user isn't signed in yet.
  useEffect(() => {
    if (!isOpen || session || !googleClientId) {
      return
    }
    let cancelled = false
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !window.google || !signInButtonRef.current) {
          return
        }
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            verifyGoogleCredential(response.credential)
              .then((verified) => {
                setAuthError(null)
                setSession(verified)
              })
              .catch((error: unknown) => {
                setAuthError(error instanceof Error ? error.message : 'Sign-in failed')
              })
          },
        })
        signInButtonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(signInButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 260,
        })
      })
      .catch(() => setAuthError('Failed to load Google Sign-In'))
    return () => {
      cancelled = true
    }
  }, [isOpen, session, googleClientId])

  // Once signed in, kick off the greeting job (downloads + summarizes the account's NS report).
  useEffect(() => {
    if (!isOpen || !session || greetingRequestedRef.current) {
      return
    }
    greetingRequestedRef.current = true
    setGreetingStatus('loading')
    setProgressMessage('Loading account report from NetStorage…')

    cancelJobRef.current = runChatGreetingJob(accountId, sessionId, session.token, archive, (event) => {
      handleGreetingEvent(event)
    })

    return () => {
      cancelJobRef.current?.()
      cancelJobRef.current = null
    }
  }, [isOpen, session, accountId, sessionId, archive])

  function handleGreetingEvent(event: ChatJobProgressEvent) {
    if (event.type === 'progress') {
      setProgressMessage(event.message ?? 'Working…')
      return
    }
    if (event.type === 'completed' && event.result) {
      setGreetingStatus('ready')
      setProgressMessage('')
      setMessages((prev) => [
        ...prev,
        { id: nextTurnId(), role: 'model', text: event.result!.greeting },
      ])
      return
    }
    if (event.type === 'failed') {
      setGreetingStatus('error')
      setProgressMessage(event.message ?? 'Failed to load account data')
    }
  }

  function handleRetryGreeting() {
    greetingRequestedRef.current = false
    setGreetingStatus('idle')
  }

  async function handleSend() {
    const trimmed = inputValue.trim()
    if (!trimmed || !session || isSending) {
      return
    }
    setInputValue('')
    setMessages((prev) => [...prev, { id: nextTurnId(), role: 'user', text: trimmed }])
    setIsSending(true)
    try {
      const reply = await sendChatMessage(accountId, sessionId, trimmed, session.token)
      setMessages((prev) => [...prev, { id: nextTurnId(), role: 'model', text: reply }])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextTurnId(),
          role: 'model',
          text: `Sorry, something went wrong: ${error instanceof Error ? error.message : 'unknown error'}`,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  async function handleFileChange(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !session) {
      return
    }
    setUploadError(null)
    setIsSending(true)
    setMessages((prev) => [...prev, { id: nextTurnId(), role: 'user', text: `📎 Uploaded file: ${file.name}` }])
    try {
      const result = await uploadChatFile(accountId, sessionId, file, session.token)
      setMessages((prev) => [...prev, { id: nextTurnId(), role: 'model', text: result.reply }])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsSending(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleSignOut() {
    clearChatSession()
    setSession(null)
    greetingRequestedRef.current = false
    setGreetingStatus('idle')
    setMessages([])
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {isOpen ? (
        <div className="flex h-[32rem] w-[24rem] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-gradient-to-r from-sky-700 to-slate-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">AI Account Assistant</p>
              {session ? <p className="text-xs text-sky-100">{session.email}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              {session ? (
                <button
                  className="text-xs font-semibold text-sky-100 underline hover:text-white"
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              ) : null}
              <button
                aria-label="Close chat"
                className="rounded-full px-2 py-1 text-lg font-bold text-sky-100 hover:bg-white/10 hover:text-white"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {!googleClientId ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                Chat bot sign-in is not configured. Set VITE_GOOGLE_OAUTH_CLIENT_ID to enable Google Sign-In.
              </p>
            ) : !session ? (
              <div className="flex flex-col items-center gap-3 pt-6 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Sign in with your akamai.com Google account to start chatting.
                </p>
                <div ref={signInButtonRef} />
                {authError ? <p className="text-xs font-semibold text-rose-600">{authError}</p> : null}
              </div>
            ) : (
              <>
                {messages.map((turn) => (
                  <div
                    key={turn.id}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      turn.role === 'user'
                        ? 'ml-auto bg-sky-700 text-white'
                        : 'mr-auto border border-slate-200 bg-white text-slate-800'
                    }`}
                  >
                    {turn.text}
                  </div>
                ))}
                {greetingStatus === 'loading' ? (
                  <p className="text-xs font-semibold text-slate-500">{progressMessage || 'Loading…'}</p>
                ) : null}
                {greetingStatus === 'error' ? (
                  <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                    <p className="mb-2">{progressMessage || 'Failed to load account data.'}</p>
                    <button
                      className="font-semibold underline"
                      onClick={handleRetryGreeting}
                      type="button"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
                {isSending ? <p className="text-xs font-semibold text-slate-500">Thinking…</p> : null}
                {uploadError ? <p className="text-xs font-semibold text-rose-600">{uploadError}</p> : null}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {session ? (
            <div className="border-t border-slate-200 bg-white p-2">
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  accept={ACCEPTED_UPLOAD_EXTENSIONS}
                  className="hidden"
                  onChange={(event) => void handleFileChange(event.target.files)}
                  type="file"
                />
                <button
                  aria-label="Upload a file"
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  disabled={isSending || greetingStatus === 'loading'}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload a data file (xlsx/csv/json/txt)"
                  type="button"
                >
                  📎
                </button>
                <textarea
                  className="max-h-24 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  disabled={isSending || greetingStatus === 'loading'}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Ask about this account's health…"
                  rows={1}
                  value={inputValue}
                />
                <button
                  className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                  disabled={isSending || greetingStatus === 'loading' || !inputValue.trim()}
                  onClick={() => void handleSend()}
                  type="button"
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        aria-label="Open AI chat assistant"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-700 text-2xl text-white shadow-2xl hover:bg-sky-800"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        💬
      </button>
    </div>
  )
}
