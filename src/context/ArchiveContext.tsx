import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchNsArchiveList } from '../services/netstorageData'

/** The NS base path used when no archive is selected (the LIVE folder). */
export const LIVE_CONTEXT_PATH = 'staticSiteContent'
const STORAGE_KEY = 'account-health:selectedArchive'

interface ArchiveContextValue {
  /** Empty string means LIVE. Persists across every page (SPA nav + full reload + browser session). */
  archive: string
  setArchive: (value: string) => void
  /** Read-only value shown as "Context (NS base path):" everywhere: inherits `archive`, defaults to LIVE. */
  contextPath: string
  archiveOptions: string[]
  isLoadingArchiveOptions: boolean
  archiveOptionsError: string | null
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null)

function readStoredArchive(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function ArchiveProvider({ children }: PropsWithChildren) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [archive, setArchiveState] = useState<string>(() => searchParams.get('archive') ?? readStoredArchive())
  const [archiveOptions, setArchiveOptions] = useState<string[]>([])
  const [isLoadingArchiveOptions, setIsLoadingArchiveOptions] = useState(true)
  const [archiveOptionsError, setArchiveOptionsError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadArchiveOptions() {
      setIsLoadingArchiveOptions(true)
      const result = await fetchNsArchiveList()
      if (!isMounted) {
        return
      }
      setArchiveOptions(result.data)
      setArchiveOptionsError(result.error ?? null)
      setIsLoadingArchiveOptions(false)
    }

    void loadArchiveOptions()

    return () => {
      isMounted = false
    }
  }, [])

  function setArchive(value: string) {
    setArchiveState(value)
    try {
      if (value) {
        window.localStorage.setItem(STORAGE_KEY, value)
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // ignore storage failures (e.g. private browsing)
    }
    // Keep the current route's URL in sync so refreshes/shareable links preserve the selection.
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous)
        if (value) {
          params.set('archive', value)
        } else {
          params.delete('archive')
        }
        return params
      },
      { replace: true },
    )
  }

  const value = useMemo<ArchiveContextValue>(
    () => ({
      archive,
      setArchive,
      contextPath: archive || LIVE_CONTEXT_PATH,
      archiveOptions,
      isLoadingArchiveOptions,
      archiveOptionsError,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archive, archiveOptions, isLoadingArchiveOptions, archiveOptionsError],
  )

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>
}

export function useArchive(): ArchiveContextValue {
  const context = useContext(ArchiveContext)
  if (!context) {
    throw new Error('useArchive must be used within an ArchiveProvider')
  }
  return context
}
