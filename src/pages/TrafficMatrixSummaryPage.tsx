import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { useArchive } from '../context/ArchiveContext'
import {
  runTrafficMatrixSummaryJob,
  getTrafficMatrixDownloadUrl,
  TRAFFIC_MATRIX_CSV_FILENAME,
} from '../services/trafficMatrixJobs'
import type {
  CsvDataMode,
  JobProgressLevel,
  TrafficMatrixSummaryJobProgressEvent,
  TrafficMatrixSummaryResult,
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

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

export function TrafficMatrixSummaryPage() {
  const { accountId = '' } = useParams()
  const dataMode: CsvDataMode = 'csv_data_remote'
  const { archive: context, contextPath } = useArchive()
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<TrafficMatrixSummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chartColumn, setChartColumn] = useState(EDGE_VS_ORIGIN_COLUMN)
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

      unsubscribeRef.current = runTrafficMatrixSummaryJob(
        accountId,
        dataMode,
        context || undefined,
        (event: TrafficMatrixSummaryJobProgressEvent) => {
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
    }

    void run()

    return () => {
      isMounted = false
      unsubscribeRef.current?.()
    }
  }, [accountId, dataMode, context])

  const chartData = useMemo(() => {
    if (!result) {
      return []
    }
    if (chartColumn === EDGE_VS_ORIGIN_COLUMN) {
      return [
        { label: 'Edge Hits', count: result.totals.edgeHits },
        { label: 'Origin Hits', count: result.totals.originHits },
      ]
    }
    return (result.breakdowns[chartColumn] ?? []).map((item) => ({ label: item.value, count: item.count }))
  }, [result, chartColumn])

  const chartTotal = chartData.reduce((sum, item) => sum + item.count, 0)

  return (
    <DashboardLayout title="Traffic Matrix Summary">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/trafficMatrix?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Table →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/trafficMatrix/scoreCard?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View ScoreCard →
            </Link>
          </div>
        </div>

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
              href={getTrafficMatrixDownloadUrl(accountId, context || undefined)}
              target="_blank"
              rel="noreferrer"
            >
              {TRAFFIC_MATRIX_CSV_FILENAME}
            </a>
          </p>
        ) : null}

        {result ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Summary</h2>
            <div className="mb-6 flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
              <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Hostnames: {result.totals.hostnames}</span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                Edge Hits: {formatCompactNumber(result.totals.edgeHits)}
              </span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                Origin Hits: {formatCompactNumber(result.totals.originHits)}
              </span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                Edge Bytes: {formatCompactNumber(result.totals.edgeBytes)}
              </span>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                Origin Bytes: {formatCompactNumber(result.totals.originBytes)}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                Hits Offload (avg): {result.totals.hostnames ? (result.totals.hitsOffload / result.totals.hostnames).toFixed(2) : '0'}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                Bytes Offload (avg): {result.totals.hostnames ? (result.totals.bytesOffload / result.totals.hostnames).toFixed(2) : '0'}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Chart by metric:
                <select
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  value={chartColumn}
                  onChange={(event) => {
                    setChartColumn(event.target.value)
                    setSelectedSlice(null)
                  }}
                >
                  <option value={EDGE_VS_ORIGIN_COLUMN}>Edge vs Origin Hits (overall)</option>
                  {result.metricColumns.map((column) => (
                    <option key={column} value={column}>
                      Top hostnames by {column}
                    </option>
                  ))}
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
                        <td className="px-2 py-2">{formatCompactNumber(item.count)}</td>
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

const EDGE_VS_ORIGIN_COLUMN = '__edgeVsOrigin__'

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
  '#94a3b8',
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
  onSelectSlice: (label: string | null) => void
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const radius = 70
  const strokeWidth = 34
  const circumference = 2 * Math.PI * radius

  let cumulativeFraction = 0

  return (
    <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label="Interactive pie chart">
      <g transform="rotate(-90 90 90)">
        {total === 0 ? (
          <circle cx={90} cy={90} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        ) : (
          data.map((item, index) => {
            const fraction = item.count / total
            const dash = fraction * circumference
            const gap = circumference - dash
            const offset = circumference * (1 - cumulativeFraction)
            cumulativeFraction += fraction
            const isDimmed = selectedLabel !== null && selectedLabel !== item.label
            return (
              <circle
                key={item.label}
                cx={90}
                cy={90}
                r={radius}
                fill="none"
                stroke={PIE_COLORS[index % PIE_COLORS.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                opacity={isDimmed ? 0.3 : 1}
                className="cursor-pointer transition-opacity"
                onClick={() => onSelectSlice(selectedLabel === item.label ? null : item.label)}
              >
                <title>
                  {item.label}: {item.count} ({((fraction) * 100).toFixed(1)}%)
                </title>
              </circle>
            )
          })
        )}
      </g>
      <text x={90} y={86} textAnchor="middle" className="fill-slate-700 text-sm font-bold">
        {formatCompactNumber(total)}
      </text>
      <text x={90} y={102} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
        total
      </text>
    </svg>
  )
}
