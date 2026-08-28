import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountMappingEntry } from '../types/dashboard'

interface AccountSearchDropdownProps {
  accounts: AccountMappingEntry[]
  archive?: string
}

function buildAccountUrl(accountName: string, archive?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = `${base}/account/${encodeURIComponent(accountName)}`
  return archive ? `${path}?archive=${encodeURIComponent(archive)}` : path
}

export function AccountSearchDropdown({ accounts, archive }: AccountSearchDropdownProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return accounts
    }
    return accounts.filter((account) => account.accountName.toLowerCase().includes(normalizedQuery))
  }, [accounts, query])

  function navigateToAccount(accountName: string) {
    // Full page reload, as the account detail page loads its own fresh NetStorage-backed dataset.
    window.location.href = buildAccountUrl(accountName, archive)
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-md">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm transition focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200">
        <input
          className="w-full border-none text-sm text-slate-800 outline-none placeholder:text-slate-400"
          placeholder="Search or select an account…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredAccounts.length === 1) {
              navigateToAccount(filteredAccounts[0].accountName)
            }
          }}
        />
        <button
          type="button"
          aria-label="Toggle account list"
          className="shrink-0 text-slate-500 hover:text-slate-700"
          onClick={() => setIsOpen((previous) => !previous)}
        >
          ▾
        </button>
      </div>

      {isOpen && filteredAccounts.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white text-left shadow-lg">
          {filteredAccounts.map((account) => (
            <li key={account.accountId}>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700"
                onClick={() => navigateToAccount(account.accountName)}
              >
                {account.accountName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {isOpen && query.trim() && filteredAccounts.length === 0 ? (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-lg">
          No matching accounts
        </div>
      ) : null}
    </div>
  )
}
