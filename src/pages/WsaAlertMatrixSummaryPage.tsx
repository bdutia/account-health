import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { startWsaAlertMatrixSummaryJob, subscribeToWsaAlertMatrixSummaryJob } from '../services/wsaAlertMatrixJobs'
import type {
  CsvDataMode,
  JobProgressLevel,
  WsaAlertMatrixSummaryJobProgressEvent,
  WsaAlertMatrixSummaryResult,
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

const OVERALL_COLUMN = '__overall__'

const PIE_COLORS = [
  '#0ea5e9',
  '#f43f5e',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#eab308',
]

interface PieSlice {
  label: string
  count: number
}

function PieChart({
  data,
  selectedLabel,
  onSelectSlice,
}: {
  data: PieSlice[]
  selectedLabel: string | null
  onSelectSlice: (label: string) => void
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  if (total === 0) {
    return <div className="h-40 w-40 rounded-full bg-slate-100" />
  }

  let cumulative = 0
  const slices = data.map((item, index) => {
    const startAngle = (cumulative / total) * 2 * Math.PI
    cumulative += item.count
    const endAngle = (cumulative / total) * 2 * Math.PI
    const x1 = Math.cos(startAngle - Math.PI / 2)
    const y1 = Math.sin(startAngle - Math.PI / 2)
    const x2 = Math.cos(endAngle - Math.PI / 2)
    const y2 = Math.sin(endAngle - Math.PI / 2)
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
    return {
      label: item.label,
      color: PIE_COLORS[index % PIE_COLORS.length],
      path: `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArc} 1 ${x2} ${y2} Z`,
      isSelected: selectedLabel === item.label,
    }
  })

  return (
    <svg viewBox="-1.3 -1.3 2.6 2.6" className="h-40 w-40 shrink-0">
      {slices.map((slice) => (
        <path
          key={slice.label}
          d={slice.path}
          fill={slice.color}
          stroke="white"
          strokeWidth={slice.isSelected ? 0.06 : 0.02}
          opacity={selectedLabel && !slice.isSelected ? 0.45 : 1}
          className="cursor-pointer"
          onClick={() => onSelectSlice(slice.label)}
        />
      ))}
    </svg>
  )
}

export function WsaAlertMatrixSummaryPage() {
  const { accountId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const initialDataMode = searchParams.get('data') === 'csv_data_remote' ? 'csv_data_remote' : 'csv_data_local'
  const [dataMode, setDataMode] = useState<CsvDataMode>(initialDataMode)
  const [context, setContext] = useState(searchParams.get('context') ?? '')
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<WsaAlertMatrixSummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chartColumn, setChartColumn] = useState(OVERALL_COLUMN)
  const [selectedSlice, setSelectedSlice] = useState<string | null>(null)
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
        const jobId = await startWsaAlertMatrixSummaryJob(accountId, dataMode, context || undefined)
        if (!isMounted) return

        unsubscribeRef.current = subscribeToWsaAlertMatrixSummaryJob(
          accountId,
          jobId,
          (event: WsaAlertMatrixSummaryJobProgressEvent) => {
            if (!isMounted) return

            if (event.type === 'progress') {
              setPercent(event.percent)
              setLogs((prev) => [...prev, { message: event.message, level: event.level, timestamp: event.timestamp }])
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

  const chartData = useMemo(() => {
    if (!result) return []
    if (chartColumn === OVERALL_COLUMN) {
      return [
        { label: 'Enabled', count: result.totals.enabled },
        { label: 'Disabled', count: result.totals.disabled },
      ]
    }
    return (result.breakdowns[chartColumn] ?? []).map((item) => ({ label: item.value, count: item.count }))
  }, [result, chartColumn])

  const chartTotal = chartData.reduce((sum, item) => sum + item.count, 0)

  // Determine the label groups for the feature selector dropdown
  const baseColumnOptions = useMemo(() => (result ? result.baseColumns : []), [result])
  const featureColumnOptions = useMemo(() => (result ? result.featureColumns : []), [result])

  return (
    <DashboardLayout title="WSA Alert Matrix Summary">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/wsaAlertMatrix?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Table →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/wsaAlertMatrix/scoreCard?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
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
                {status === 'running'
                  ? `Running… ${percent}%`
                  : status === 'completed'
                    ? 'Completed'
                    : status === 'failed'
                      ? 'Failed'
                      : ''}
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
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Configs: {result.totals.configs}</span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Features: {result.totals.features}</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Enabled: {result.totals.enabled}</span>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Disabled: {result.totals.disabled}</span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Chart by column:
                <select
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  value={chartColumn}
                  onChange={(event) => {
                    setChartColumn(event.target.value)
                    setSelectedSlice(null)
                  }}
                >
                  <option value={OVERALL_COLUMN}>Overall Feature Adoption (enabled / disabled)</option>
                  {baseColumnOptions.length > 0 ? (
                    <optgroup label="Identity columns">
                      {baseColumnOptions.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {featureColumnOptions.length > 0 ? (
                    <optgroup label="Feature columns">
                      {featureColumnOptions.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {selectedSlice ? (
                <button
                  type="button"
                  onClick={() => setSelectedSlice(null)}
                  className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                >
                  Clear selection
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-start gap-8">
              <PieChart data={chartData} selectedLabel={selectedSlice} onSelectSlice={setSelectedSlice} />

              <div className="min-w-[16rem] flex-1 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-2 py-1 font-semibold">Value</th>
                      <th className="px-2 py-1 font-semibold">Count</th>
                      <th className="px-2 py-1 font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((item, index) => (
                      <tr
                        key={item.label}
                        onClick={() => setSelectedSlice(selectedSlice === item.label ? null : item.label)}
                        className={`cursor-pointer rounded-lg text-slate-700 ${selectedSlice === item.label ? 'bg-sky-100' : 'bg-slate-50'}`}
                      >
                        <td className="px-2 py-2 font-semibold">
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                            style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                          />
                          {item.label}
                        </td>
                        <td className="px-2 py-2">{item.count}</td>
                        <td className="px-2 py-2">
                          {chartTotal ? `${((item.count / chartTotal) * 100).toFixed(1)}%` : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
