import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import {
  startHostnameCnameMatrixSummaryJob,
  subscribeToHostnameCnameMatrixSummaryJob,
} from '../services/hostnameCnameJobs'
import type {
  CsvDataMode,
  HostnameCnameMatrixSummaryJobProgressEvent,
  HostnameCnameMatrixSummaryResult,
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

export function HostMatrixCnameSummaryPage() {
  const { accountId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialDataMode = searchParams.get('data') === 'csv_data_remote' ? 'csv_data_remote' : 'csv_data_local'
  const [dataMode, setDataMode] = useState<CsvDataMode>(initialDataMode)
  const [context, setContext] = useState(searchParams.get('context') ?? '')
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<HostnameCnameMatrixSummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
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

      try {
        const jobId = await startHostnameCnameMatrixSummaryJob(accountId, dataMode, context || undefined)
        if (!isMounted) {
          return
        }

        unsubscribeRef.current = subscribeToHostnameCnameMatrixSummaryJob(
          accountId,
          jobId,
          (event: HostnameCnameMatrixSummaryJobProgressEvent) => {
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

  return (
    <DashboardLayout title="Hostname CNAME Matrix Summary">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <Link
            className="text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/hostmatrix/cname?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
          >
            View Table →
          </Link>
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
            <h2 className="mb-4 text-lg font-bold text-slate-800">Summary</h2>
            <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
              <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Rows: {result.totals.rows}</span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Hostnames: {result.totals.hostnames}</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Mapped: {result.totals.mapped}</span>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Unmapped: {result.totals.unmapped}</span>
            </div>

            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Breakdown by Map</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-1 font-semibold">Map</th>
                    <th className="px-2 py-1 font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mapBreakdown.map((item) => (
                    <tr key={item.map} className="rounded-lg bg-slate-50 text-slate-700">
                      <td className="px-2 py-2 font-semibold">{item.map}</td>
                      <td className="px-2 py-2">{item.count}</td>
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
