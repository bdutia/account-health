import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import {
  startHostnameCnameMatrixJob,
  subscribeToHostnameCnameMatrixJob,
} from '../services/hostnameCnameJobs'
import type {
  CsvDataMode,
  HostnameCnameMatrixJobProgressEvent,
  HostnameCnameMatrixResult,
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

export function HostMatrixCnamePage() {
  const { accountId = '' } = useParams()
  const [dataMode, setDataMode] = useState<CsvDataMode>('csv_data_local')
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<HostnameCnameMatrixResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedHostnames, setSelectedHostnames] = useState<string[]>([])
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

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

      try {
        const jobId = await startHostnameCnameMatrixJob(accountId, dataMode)
        if (!isMounted) {
          return
        }

        unsubscribeRef.current = subscribeToHostnameCnameMatrixJob(
          accountId,
          jobId,
          (event: HostnameCnameMatrixJobProgressEvent) => {
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
  }, [accountId, dataMode])

  const hostnameOptions = useMemo(() => (result ? [...result.hostnames].sort() : []), [result])

  const filteredRows = useMemo(() => {
    if (!result) {
      return []
    }
    if (selectedHostnames.length === 0) {
      return result.rows
    }
    const selectedSet = new Set(selectedHostnames)
    return result.rows.filter((row) => selectedSet.has(row.hostname ?? ''))
  }, [result, selectedHostnames])

  function toggleHostname(hostname: string) {
    setSelectedHostnames((previous) =>
      previous.includes(hostname) ? previous.filter((value) => value !== hostname) : [...previous, hostname],
    )
  }

  return (
    <DashboardLayout title="Hostname CNAME Matrix">
      <div className="space-y-6">
        <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
          ← Back to account
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Scan Progress</h2>
            <div className="flex items-center gap-3">
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
              <h2 className="text-lg font-bold text-slate-800">Hostname / CNAME Matrix</h2>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Hostnames: {result.totals.hostnames}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Rows: {result.totals.rows}</span>
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
                    {result.columns.map((column) => (
                      <th key={column} className="px-2 py-1 font-semibold">
                        {column}
                      </th>
                    ))}
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
        ) : null}
      </div>
    </DashboardLayout>
  )
}
