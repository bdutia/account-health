import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { startFeatureMatrixJob, subscribeToFeatureMatrixJob } from '../services/featureMatrixJobs'
import type {
  CsvDataMode,
  FeatureMatrixJobProgressEvent,
  FeatureMatrixResult,
  JobProgressLevel,
} from '../types/dashboard'

interface LogEntry {
  message: string
  level: JobProgressLevel
  timestamp: number
}

type JobStatus = 'idle' | 'running' | 'completed' | 'failed'

const LOG_LEVEL_STYLES: Record<JobProgressLevel, string> = {
  info: 'text-slate-600',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  error: 'text-rose-700',
}

const DATA_MODE_OPTIONS: Array<{ value: CsvDataMode; label: string }> = [
  { value: 'csv_data_local', label: 'Local (test data)' },
  { value: 'csv_data_remote', label: 'Remote (NetStorage)' },
]

export function FeatureMatrixPage() {
  const { accountId = '', propIdOrFeature } = useParams()
  const [searchParams] = useSearchParams()
  const initialDataMode = searchParams.get('data') === 'csv_data_remote' ? 'csv_data_remote' : 'csv_data_local'
  const [dataMode, setDataMode] = useState<CsvDataMode>(initialDataMode)
  const [context, setContext] = useState(searchParams.get('context') ?? '')
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<FeatureMatrixResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedProperties, setSelectedProperties] = useState<string[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const appliedDeepLinkRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let isMounted = true

    async function run() {
      unsubscribeRef.current?.()
      setStatus('running')
      setPercent(0)
      setLogs([])
      setResult(null)
      setError(null)
      setSelectedProperties([])
      setColumnFilters({})

      try {
        const jobId = await startFeatureMatrixJob(accountId, dataMode, context || undefined)
        if (!isMounted) {
          return
        }

        unsubscribeRef.current = subscribeToFeatureMatrixJob(
          accountId,
          jobId,
          (event: FeatureMatrixJobProgressEvent) => {
            if (!isMounted) {
              return
            }

            if (event.type === 'progress') {
              setPercent(event.percent)
              setLogs((previous) => [...previous, { message: event.message, level: event.level, timestamp: event.timestamp }])
              return
            }

            if (event.type === 'completed') {
              setPercent(100)
              setStatus('completed')
              setResult(event.result)
              return
            }

            setStatus('failed')
            setError(event.message)
          },
        )
      } catch (startError) {
        if (isMounted) {
          setStatus('failed')
          setError(startError instanceof Error ? startError.message : 'Failed to start job')
        }
      }
    }

    void run()

    return () => {
      isMounted = false
      unsubscribeRef.current?.()
    }
  }, [accountId, dataMode, context])

  // Deep-link support: /featureMatrix/:propIdOrFeature pre-selects a property or a feature column.
  useEffect(() => {
    if (!result || !propIdOrFeature || appliedDeepLinkRef.current === propIdOrFeature) {
      return
    }
    appliedDeepLinkRef.current = propIdOrFeature
    const matchedProperty = result.properties.find((name) => name.toLowerCase() === propIdOrFeature.toLowerCase())
    if (matchedProperty) {
      setSelectedProperties([matchedProperty])
      return
    }
    const matchedFeature = result.featureColumns.find(
      (name) => name.toLowerCase() === propIdOrFeature.toLowerCase(),
    )
    if (matchedFeature) {
      setColumnFilters({ [matchedFeature]: ['Enabled'] })
    }
  }, [result, propIdOrFeature])

  const propertyOptions = useMemo(() => (result ? [...result.properties].sort() : []), [result])

  const columnValueOptions = useMemo(() => {
    if (!result) {
      return {} as Record<string, string[]>
    }
    const options: Record<string, string[]> = {}
    for (const column of result.columns) {
      const values = new Set<string>()
      for (const row of result.rows) {
        values.add(row[column]?.trim() || '(blank)')
      }
      options[column] = [...values].sort()
    }
    return options
  }, [result])

  const filteredRows = useMemo(() => {
    if (!result) {
      return []
    }
    let rows = result.rows
    if (selectedProperties.length > 0) {
      const selectedSet = new Set(selectedProperties)
      rows = rows.filter((row) => selectedSet.has(row.propertyName ?? ''))
    }
    for (const [column, selectedValues] of Object.entries(columnFilters)) {
      if (selectedValues.length === 0) {
        continue
      }
      const selectedSet = new Set(selectedValues)
      rows = rows.filter((row) => selectedSet.has(row[column]?.trim() || '(blank)'))
    }
    return rows
  }, [result, selectedProperties, columnFilters])

  function toggleProperty(propertyName: string) {
    setSelectedProperties((previous) =>
      previous.includes(propertyName) ? previous.filter((value) => value !== propertyName) : [...previous, propertyName],
    )
  }

  function toggleColumnFilterValue(column: string, value: string) {
    setColumnFilters((previous) => {
      const allValues = columnValueOptions[column] ?? []
      const current = previous[column] ?? allValues
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      return { ...previous, [column]: next }
    })
  }

  function clearColumnFilter(column: string) {
    setColumnFilters((previous) => {
      const next = { ...previous }
      delete next[column]
      return next
    })
  }

  return (
    <DashboardLayout title="Feature Matrix">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/featureMatrix/summary?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Summary →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/featureMatrix/scoreCard?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View ScoreCard →
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Scan Progress</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Data Source:
                <select
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  value={dataMode}
                  onChange={(event) => setDataMode(event.target.value as CsvDataMode)}
                >
                  {DATA_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {dataMode === 'csv_data_remote' ? (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  Context (NS base path):
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                    placeholder="e.g. staticSiteContent"
                    value={context}
                    onChange={(event) => setContext(event.target.value)}
                  />
                </label>
              ) : null}
              <span className="text-sm font-semibold text-slate-600">
                {status === 'running' ? `Running… ${percent}%` : status === 'completed' ? 'Completed' : status === 'failed' ? 'Failed' : ''}
              </span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}

          <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 font-mono text-xs">
            {logs.map((log, index) => (
              <li key={`${log.timestamp}-${index}`} className={LOG_LEVEL_STYLES[log.level]}>
                {log.message}
              </li>
            ))}
          </ul>
        </section>

        {result ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">Property / Feature Matrix</h2>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Properties: {result.totals.properties}</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Features: {result.totals.features}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Rows: {result.totals.rows}</span>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-start gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate-700">Filter Properties (multi-select):</span>
                <select
                  multiple
                  className="min-w-[16rem] rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  size={Math.min(8, Math.max(4, propertyOptions.length))}
                  value={selectedProperties}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions, (option) => option.value)
                    setSelectedProperties(values)
                  }}
                >
                  {propertyOptions.map((propertyName) => (
                    <option key={propertyName} value={propertyName}>
                      {propertyName}
                    </option>
                  ))}
                </select>
                {selectedProperties.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProperties.map((propertyName) => (
                      <button
                        key={propertyName}
                        type="button"
                        onClick={() => toggleProperty(propertyName)}
                        className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-200"
                      >
                        {propertyName} ✕
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedProperties([])}
                      className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                    >
                      Clear all
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="mt-6 text-xs font-semibold text-slate-500">
                {filteredRows.length} of {result.rows.length} rows
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    {result.columns.map((column) => {
                      const isFiltered = (columnFilters[column]?.length ?? 0) > 0
                      return (
                        <th key={column} className="relative px-2 py-1 font-semibold">
                          <button
                            type="button"
                            onClick={() => setOpenFilterColumn(openFilterColumn === column ? null : column)}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 ${isFiltered ? 'text-sky-700' : ''}`}
                          >
                            {column}
                            <span aria-hidden="true">{isFiltered ? '▾●' : '▾'}</span>
                          </button>
                          {openFilterColumn === column ? (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenFilterColumn(null)} />
                              <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 text-xs font-normal normal-case text-slate-700 shadow-lg">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    className="font-semibold text-sky-700 hover:underline"
                                    onClick={() => clearColumnFilter(column)}
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
                                {(columnValueOptions[column] ?? []).map((value) => {
                                  const selected = columnFilters[column] ?? []
                                  const checked = selected.length === 0 || selected.includes(value)
                                  return (
                                    <label key={value} className="flex items-center gap-2 py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleColumnFilterValue(column, value)}
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
                  {filteredRows.map((row, index) => (
                    <tr key={`${row.propertyName}-${index}`} className="rounded-lg bg-slate-50 text-slate-700">
                      {result.columns.map((column) => (
                        <td key={column} className="px-2 py-2">
                          {row[column] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
