import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toneBadgeStyles, toneTextStyles } from './tone'
import type { AccountSummaryRow, HealthTone } from '../types/dashboard'

interface AccountsTableProps {
  rows: AccountSummaryRow[]
}

const RANDOM_PREVIEW_COUNT = 5
const SEARCH_SUGGESTION_LIMIT = 8

interface FilterColumnDef {
  key: string
  label: string
  getValue: (row: AccountSummaryRow) => string
}

const FILTER_COLUMNS: FilterColumnDef[] = [
  { key: 'name', label: 'Account', getValue: (row) => row.name || '(blank)' },
  { key: 'healthScore', label: 'Health Score', getValue: (row) => String(row.healthScore.value) },
  { key: 'renewalRisk', label: 'Renewal Risk', getValue: (row) => row.renewalRisk || '(blank)' },
  { key: 'expansionPotential', label: 'Expansion Potential', getValue: (row) => row.expansionPotential || '(blank)' },
  { key: 'technicalMaturity', label: 'Technical Maturity', getValue: (row) => row.technicalMaturity || '(blank)' },
  { key: 'deliveryHealth', label: 'Delivery Health', getValue: (row) => row.deliveryHealth || '(blank)' },
  { key: 'execAttention', label: 'Exec Attention', getValue: (row) => row.execAttention || '(blank)' },
]

function statusToTone(status: string): HealthTone {
  const lower = status.toLowerCase()
  if (lower.includes('risk') || lower.includes('off track') || lower.includes('escalation')) return 'risk'
  if (lower.includes('healthy') || lower.includes('track') || lower.includes('growth') || lower.includes('expansion')) {
    return 'healthy'
  }
  if (lower.includes('limited') || lower.includes('review') || lower.includes('push') || lower.includes('opportunity')) {
    return 'watch'
  }
  return 'neutral'
}

/** Fisher-Yates shuffle so the default preview isn't just the first N rows. */
function sampleRandomRows(rows: AccountSummaryRow[], count: number): AccountSummaryRow[] {
  const copy = [...rows]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export function AccountsTable({ rows }: AccountsTableProps) {
  const [nameQuery, setNameQuery] = useState('')
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Stable per data-load random preview; only reshuffles when the underlying rows change (e.g. new archive selected).
  const randomPreviewRows = useMemo(() => sampleRandomRows(rows, RANDOM_PREVIEW_COUNT), [rows])

  const columnValueOptions = useMemo(() => {
    const options: Record<string, string[]> = {}
    for (const column of FILTER_COLUMNS) {
      const values = new Set<string>()
      for (const row of rows) {
        values.add(column.getValue(row))
      }
      options[column.key] = [...values].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    }
    return options
  }, [rows])

  const hasActiveFilters = nameQuery.trim().length > 0 || Object.values(columnFilters).some((values) => values.length > 0)

  const filteredRows = useMemo(() => {
    let result = rows
    const query = nameQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((row) => row.name.toLowerCase().includes(query))
    }
    for (const column of FILTER_COLUMNS) {
      const selectedValues = columnFilters[column.key]
      if (!selectedValues || selectedValues.length === 0) {
        continue
      }
      const selectedSet = new Set(selectedValues)
      result = result.filter((row) => selectedSet.has(column.getValue(row)))
    }
    return result
  }, [rows, nameQuery, columnFilters])

  const visibleRows = hasActiveFilters ? filteredRows : randomPreviewRows

  const searchSuggestions = useMemo(() => {
    const query = nameQuery.trim().toLowerCase()
    if (!query) {
      return []
    }
    return rows.filter((row) => row.name.toLowerCase().includes(query)).slice(0, SEARCH_SUGGESTION_LIMIT)
  }, [rows, nameQuery])

  function toggleColumnFilterValue(columnKey: string, value: string) {
    setColumnFilters((previous) => {
      const allValues = columnValueOptions[columnKey] ?? []
      const current = previous[columnKey] ?? allValues
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      return { ...previous, [columnKey]: next }
    })
  }

  function clearColumnFilter(columnKey: string) {
    setColumnFilters((previous) => {
      const next = { ...previous }
      delete next[columnKey]
      return next
    })
  }

  function clearAllFilters() {
    setNameQuery('')
    setColumnFilters({})
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Account Overview</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div ref={searchContainerRef} className="relative">
            <input
              className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
              placeholder="Search or select an account..."
              value={nameQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(event) => {
                setNameQuery(event.target.value)
                setIsSearchOpen(true)
              }}
            />
            {isSearchOpen && nameQuery.trim() ? (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-80 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 text-sm shadow-lg">
                {searchSuggestions.length === 0 ? (
                  <p className="px-3 py-2 text-slate-500">No accounts found.</p>
                ) : (
                  searchSuggestions.map((row) => (
                    <Link
                      key={row.accountId}
                      to={`/account/${row.accountId}`}
                      onClick={() => setIsSearchOpen(false)}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-sky-50"
                    >
                      <span className="truncate font-semibold text-slate-800">{row.name}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneBadgeStyles[row.healthScore.tone]}`}>
                        {row.healthScore.value}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
            >
              Clear filters
            </button>
          ) : null}
          <span className="text-xs font-semibold text-slate-500">
            {hasActiveFilters
              ? `${filteredRows.length} of ${rows.length} accounts`
              : `Showing ${visibleRows.length} random of ${rows.length} accounts`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {FILTER_COLUMNS.map((column) => {
                const isFiltered = (columnFilters[column.key]?.length ?? 0) > 0
                return (
                  <th key={column.key} className="relative pb-3 pr-4">
                    <button
                      type="button"
                      onClick={() => setOpenFilterColumn(openFilterColumn === column.key ? null : column.key)}
                      className={`flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 ${isFiltered ? 'text-sky-700' : ''}`}
                    >
                      {column.label}
                      <span aria-hidden="true">{isFiltered ? '▾●' : '▾'}</span>
                    </button>
                    {openFilterColumn === column.key ? (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenFilterColumn(null)} />
                        <div className={`absolute left-0 top-full z-20 mt-1 max-h-72 ${column.key === 'name' ? 'w-72' : 'w-56'} overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 text-xs font-normal normal-case text-slate-700 shadow-lg`}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="font-semibold text-sky-700 hover:underline"
                              onClick={() => clearColumnFilter(column.key)}
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              className="font-semibold text-slate-500 hover:underline"
                              onClick={() => setOpenFilterColumn(null)}
                            >
                              Close
                            </button>
                          </div>
                          {(columnValueOptions[column.key] ?? []).map((value) => {
                            const selected = columnFilters[column.key] ?? []
                            const checked = selected.length === 0 || selected.includes(value)
                            return (
                              <label key={value} className="flex items-center gap-2 py-0.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleColumnFilterValue(column.key, value)}
                                />
                                <span className="truncate">{value}</span>
                              </label>
                            )
                          })}
                        </div>
                      </>
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.accountId} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-3 pr-4 font-semibold text-slate-900">
                  <Link className="hover:text-sky-700 hover:underline" to={`/account/${row.accountId}`}>
                    {row.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full border px-3 py-1 font-semibold ${toneBadgeStyles[row.healthScore.tone]}`}>
                    {row.healthScore.value}
                  </span>
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.renewalRisk)]}`}>
                  {row.renewalRisk}
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.expansionPotential)]}`}>
                  {row.expansionPotential}
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">{row.technicalMaturity}</span>
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.deliveryHealth)]}`}>
                  {row.deliveryHealth}
                </td>
                <td className="py-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{row.execAttention}</span>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={FILTER_COLUMNS.length} className="py-6 text-center text-sm font-semibold text-slate-500">
                  No accounts match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
