import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { useArchive } from '../context/ArchiveContext'
import { CoreWebVitalsLineChart } from '../components/CoreWebVitalsLineChart'
import { runPerfMatrixTopNJob, getPerfMatrixTopNDownloadUrl, PERF_MATRIX_TOPN_CSV_FILENAME } from '../services/perfMatrixTopNJobs'
import type {
  CsvDataMode,
  JobProgressLevel,
  PerfMatrixTopNJobProgressEvent,
  PerfMatrixTopNResult,
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

export function PerfMatrixTopNPage() {
  const { accountId = '', hostname: hostnameParam } = useParams()
  const dataMode: CsvDataMode = 'csv_data_remote'
  const { archive: context, contextPath } = useArchive()
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<PerfMatrixTopNResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedHostnames, setSelectedHostnames] = useState<string[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({})
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null)
  const [trendHostname, setTrendHostname] = useState<string>('')
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
      setSelectedHostnames([])
      setColumnFilters({})
      setTrendHostname('')

      unsubscribeRef.current = runPerfMatrixTopNJob(
        accountId,
        dataMode,
        context || undefined,
        (event: PerfMatrixTopNJobProgressEvent) => {
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
            setTrendHostname(event.result.hostnames[0] ?? '')
            return
          }

          setStatus('failed')
          setError(event.message)
        },
      )
    }

    void run()

    return () => {
      isMounted = false
      unsubscribeRef.current?.()
    }
  }, [accountId, dataMode, context])

  // Deep-link support: /perfMatrixTopN/:hostname pre-selects a hostname for filtering and the trend chart.
  useEffect(() => {
    if (!result || !hostnameParam || appliedDeepLinkRef.current === hostnameParam) {
      return
    }
    appliedDeepLinkRef.current = hostnameParam
    const matchedHostname = result.hostnames.find((name) => name.toLowerCase() === hostnameParam.toLowerCase())
    if (matchedHostname) {
      setSelectedHostnames([matchedHostname])
      setTrendHostname(matchedHostname)
    }
  }, [result, hostnameParam])

  const hostnameOptions = useMemo(() => (result ? [...result.hostnames].sort() : []), [result])

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
    if (selectedHostnames.length > 0) {
      const selectedSet = new Set(selectedHostnames)
      rows = rows.filter((row) => selectedSet.has(row.hostname ?? ''))
    }
    for (const [column, selectedValues] of Object.entries(columnFilters)) {
      if (selectedValues.length === 0) {
        continue
      }
      const selectedSet = new Set(selectedValues)
      rows = rows.filter((row) => selectedSet.has(row[column]?.trim() || '(blank)'))
    }
    return rows
  }, [result, selectedHostnames, columnFilters])

  function toggleHostname(hostname: string) {
    setSelectedHostnames((previous) =>
      previous.includes(hostname) ? previous.filter((value) => value !== hostname) : [...previous, hostname],
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
    <DashboardLayout title="Performance Matrix — Top 10 Hostnames">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/perfMatrixTopN/summary?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Summary →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/perfMatrixTopN/scoreCard?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View ScoreCard →
            </Link>
          </div>
        </div>

        <p className="rounded-lg bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800">
          Only the top 10 hostnames by 7-day edge hits (from traffic-report-hits-by-hostname.csv) are tested live
          against CrUX/PageSpeed Insights, to keep this feature fast and inexpensive.
        </p>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Scan Progress</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Data Source: Remote (NetStorage)
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Context (NS base path):
                <span
                  className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-normal text-slate-600"
                  title="Inherited from the Archive(s) selection above"
                >
                  {contextPath}
                </span>
              </span>
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
          <p className="text-xs font-semibold text-slate-600">
            You can download the data used in this dashboard here:{' '}
            <a
              className="text-sky-700 underline"
              href={getPerfMatrixTopNDownloadUrl(accountId, context || undefined)}
              target="_blank"
              rel="noreferrer"
            >
              {PERF_MATRIX_TOPN_CSV_FILENAME}
            </a>
          </p>
        ) : null}

        {result ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800">Core Web Vitals Trend</h2>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  Hostname:
                  <select
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                    value={trendHostname}
                    onChange={(event) => setTrendHostname(event.target.value)}
                  >
                    {hostnameOptions.map((hostname) => (
                      <option key={hostname} value={hostname}>
                        {hostname}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <CoreWebVitalsLineChart hostname={trendHostname} history={result.series[trendHostname] ?? []} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800">Top 10 Hostname Performance Matrix</h2>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Top N: {result.totals.topN}</span>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                    Total hostnames in CSV: {result.totals.hostnames}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Available: {result.totals.available}</span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Unavailable: {result.totals.unavailable}</span>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-start gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-slate-700">Filter Hostnames (multi-select):</span>
                  <select
                    multiple
                    className="min-w-[16rem] rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                    size={Math.min(8, Math.max(4, hostnameOptions.length))}
                    value={selectedHostnames}
                    onChange={(event) => {
                      const values = Array.from(event.target.selectedOptions, (option) => option.value)
                      setSelectedHostnames(values)
                    }}
                  >
                    {hostnameOptions.map((hostname) => (
                      <option key={hostname} value={hostname}>
                        {hostname}
                      </option>
                    ))}
                  </select>
                  {selectedHostnames.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedHostnames.map((hostname) => (
                        <button
                          key={hostname}
                          type="button"
                          onClick={() => toggleHostname(hostname)}
                          className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-200"
                        >
                          {hostname} ✕
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedHostnames([])}
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
                      <tr key={`${row.hostname}-${index}`} className="rounded-lg bg-slate-50 text-slate-700">
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
          </>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
