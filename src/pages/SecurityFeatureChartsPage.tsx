import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { SecurityTrendLineChart, securityTrendDimensionColor } from '../components/SecurityTrendLineChart'
import { runSecurityFeatureChartsJob } from '../services/securityFeatureChartsJobs'
import type { JobProgressLevel, SecurityFeatureChartsJobProgressEvent, SecurityFeatureChartsResult } from '../types/dashboard'

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

function defaultDate(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function accountKeyToDisplayName(accountKey: string): string {
  return accountKey
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function SecurityFeatureChartsPage() {
  const { accountId = '' } = useParams()
  const [startDate, setStartDate] = useState(defaultDate(-30))
  const [endDate, setEndDate] = useState(defaultDate(0))
  const [accountName, setAccountName] = useState(accountKeyToDisplayName(accountId))
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<SecurityFeatureChartsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hiddenDimensions, setHiddenDimensions] = useState<string[]>([])
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    return () => unsubscribeRef.current?.()
  }, [])

  function runQuery() {
    unsubscribeRef.current?.()
    setStatus('running')
    setPercent(0)
    setLogs([])
    setResult(null)
    setError(null)
    setHiddenDimensions([])

    unsubscribeRef.current = runSecurityFeatureChartsJob(
      accountId,
      { startDate, endDate, accountName },
      (event: SecurityFeatureChartsJobProgressEvent) => {
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
  }

  function toggleDimension(dimension: string) {
    setHiddenDimensions((previous) =>
      previous.includes(dimension) ? previous.filter((item) => item !== dimension) : [...previous, dimension],
    )
  }

  const visibleDimensions = useMemo(
    () => (result ? result.dimensions.filter((dimension) => !hiddenDimensions.includes(dimension)) : []),
    [result, hiddenDimensions],
  )

  const canRun = Boolean(startDate && endDate && accountName.trim()) && status !== 'running'

  return (
    <DashboardLayout title="Security Feature Charts">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
        </div>

        <p className="rounded-lg bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-800">
          Pick a date range and account name, then run the query to pull live security trend data from the Grover
          API and render it as an interactive multi-dimension line chart.
        </p>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Security Trend Query</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              Start Date
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              End Date
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              Account Name
              <input
                type="text"
                placeholder="e.g. Expedia Inc"
                className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={runQuery}
              disabled={!canRun}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'running' ? 'Running…' : 'Run Query'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Scan Progress</h2>
            <span className="text-sm font-semibold text-slate-600">
              {status === 'running'
                ? `Running… ${percent}%`
                : status === 'completed'
                  ? 'Completed'
                  : status === 'failed'
                    ? 'Failed'
                    : 'Idle'}
            </span>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-800">
                Security Trends — {result.accountName} ({result.startDate} → {result.endDate})
              </h2>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-white">
                Dimensions: {result.dimensions.length}
              </span>
            </div>

            {result.dimensions.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                No numeric time-series dimensions were recognized in the API response. See the raw JSON below.
              </p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {result.dimensions.map((dimension) => {
                    const isHidden = hiddenDimensions.includes(dimension)
                    const color = securityTrendDimensionColor(dimension, result.dimensions)
                    return (
                      <button
                        key={dimension}
                        type="button"
                        onClick={() => toggleDimension(dimension)}
                        className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition"
                        style={
                          isHidden
                            ? { borderColor: '#e2e8f0', color: '#94a3b8', backgroundColor: '#f8fafc' }
                            : { borderColor: color, color, backgroundColor: `${color}1a` }
                        }
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isHidden ? '#cbd5e1' : color }} />
                        {dimension}
                      </button>
                    )
                  })}
                </div>
                <SecurityTrendLineChart series={result.series} dimensions={visibleDimensions} />
              </>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">View raw JSON response</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-300">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
