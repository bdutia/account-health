import { useEffect, useMemo, useRef, useState } from 'react'
import { LIVE_CONTEXT_PATH } from '../context/ArchiveContext'

interface ArchiveSearchDropdownProps {
  value: string
  options: string[]
  isLoading?: boolean
  onChange: (value: string) => void
}

const LIVE_OPTION_LABEL = `LIVE — ${LIVE_CONTEXT_PATH}`

function labelForArchive(archive: string): string {
  return archive ? archive : LIVE_OPTION_LABEL
}

/** Searchable dropdown/combo box for picking an archive folder (e.g. "archive/20260901"), defaulting to LIVE. */
export function ArchiveSearchDropdown({ value, options, isLoading, onChange }: ArchiveSearchDropdownProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allChoices = useMemo(() => ['', ...options], [options])

  const filteredChoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return allChoices
    }
    return allChoices.filter((archive) => labelForArchive(archive).toLowerCase().includes(normalizedQuery))
  }, [allChoices, query])

  function selectArchive(archive: string) {
    onChange(archive)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <div className="flex items-center gap-2 rounded-md border border-slate-500 bg-slate-50 px-3 py-1 text-slate-800 focus-within:border-sky-500">
        <input
          className="w-full border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder={isLoading ? 'Loading archives…' : 'Search or select…'}
          value={isOpen ? query : labelForArchive(value)}
          onFocus={() => {
            setIsOpen(true)
            setQuery('')
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredChoices.length > 0) {
              selectArchive(filteredChoices[0])
            }
            if (event.key === 'Escape') {
              setIsOpen(false)
              setQuery('')
            }
          }}
        />
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </div>
      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white text-slate-800 shadow-lg">
          {filteredChoices.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No archives found.</p>
          ) : (
            filteredChoices.map((archive) => (
              <button
                key={archive || 'live'}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-sky-50 ${archive === value ? 'bg-sky-100 font-semibold text-sky-700' : ''}`}
                onClick={() => selectArchive(archive)}
              >
                {labelForArchive(archive)}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
