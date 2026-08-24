// Shared SSE job client: starts a background job (POST), streams its progress/result
// (GET .../events, text/event-stream), and transparently retries the whole start+stream
// sequence whenever the events endpoint responds 404 (e.g. the backend restarted and lost
// the in-memory job) or the connection otherwise fails - so a page never gets stuck.

export interface RunJobWithRetryOptions<TEvent> {
  /** Starts a new job on the backend and resolves with its jobId. */
  startJob: () => Promise<string>
  /** Builds the SSE events URL for a given jobId. */
  buildEventsUrl: (jobId: string) => string
  /** Called for every parsed SSE event, plus synthetic retry/progress notices. */
  onEvent: (event: TEvent) => void
  /** Base delay (ms) before retrying after a failure. Doubles up to a max, capped at 15s. */
  retryDelayMs?: number
}

const MAX_RETRY_DELAY_MS = 15_000

/**
 * Runs a job-based SSE flow with automatic retry-on-404/failure.
 * Returns a cancel function that stops the flow (and any pending retry).
 */
export function runJobWithRetry<TEvent>(options: RunJobWithRetryOptions<TEvent>): () => void {
  const { startJob, buildEventsUrl, onEvent, retryDelayMs = 1500 } = options

  let cancelled = false
  let finished = false
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let retryTimeoutId: ReturnType<typeof setTimeout> | undefined

  function scheduleRetry(attempt: number, reason: string) {
    if (cancelled || finished) {
      return
    }
    const delay = Math.min(retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS)
    onEvent({
      type: 'progress',
      message: `${reason} Retrying in ${Math.round(delay / 1000)}s…`,
      level: 'warning',
      percent: 0,
      timestamp: Date.now(),
    } as unknown as TEvent)
    retryTimeoutId = setTimeout(() => {
      void connect(attempt + 1)
    }, delay)
  }

  async function connect(attempt: number): Promise<void> {
    if (cancelled) {
      return
    }

    let jobId: string
    try {
      jobId = await startJob()
    } catch (error) {
      scheduleRetry(attempt, `Failed to start job (${error instanceof Error ? error.message : 'network error'}).`)
      return
    }
    if (cancelled) {
      return
    }

    const url = buildEventsUrl(jobId)
    let response: Response
    try {
      response = await fetch(url)
    } catch (error) {
      scheduleRetry(attempt, `Failed to reach job events (${error instanceof Error ? error.message : 'network error'}).`)
      return
    }
    if (cancelled) {
      return
    }

    if (response.status === 404) {
      scheduleRetry(attempt, 'Job events not found (404); the job may have expired.')
      return
    }
    if (!response.ok || !response.body) {
      scheduleRetry(attempt, `Job events request failed (status ${response.status}).`)
      return
    }

    const reader = response.body.getReader()
    currentReader = reader
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (!cancelled && !finished) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })

        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)

          const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'))
          if (dataLine) {
            const jsonText = dataLine.slice('data:'.length).trim()
            if (jsonText) {
              try {
                const event = JSON.parse(jsonText) as TEvent & { type?: string }
                onEvent(event)
                if (event.type === 'completed' || event.type === 'failed') {
                  finished = true
                }
              } catch {
                // Ignore malformed SSE payloads.
              }
            }
          }

          separatorIndex = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!cancelled && !finished) {
        scheduleRetry(attempt, `Job events stream interrupted (${error instanceof Error ? error.message : 'network error'}).`)
      }
      return
    }

    if (!finished && !cancelled) {
      // Stream ended without a completed/failed event (e.g. connection dropped mid-flight).
      scheduleRetry(attempt, 'Job events stream ended unexpectedly.')
    }
  }

  void connect(0)

  return () => {
    cancelled = true
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId)
    }
    currentReader?.cancel().catch(() => {
      // Ignore cancellation errors.
    })
  }
}
