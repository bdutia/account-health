import type { PerfMatrixHistoryPoint } from '../types/dashboard'

const METRIC_CONFIG: Array<{ key: 'lcpMs' | 'inpMs' | 'cls'; label: string; unit: string; color: string }> = [
  { key: 'lcpMs', label: 'LCP', unit: 'ms', color: '#0ea5e9' },
  { key: 'inpMs', label: 'INP', unit: 'ms', color: '#8b5cf6' },
  { key: 'cls', label: 'CLS', unit: '', color: '#f59e0b' },
]

const CHART_WIDTH = 260
const CHART_HEIGHT = 110
const PADDING = 24

function buildPoints(values: Array<number | null>): { points: string; hasData: boolean } {
  const numericValues = values.filter((value): value is number => value !== null)
  if (numericValues.length === 0) {
    return { points: '', hasData: false }
  }
  const min = Math.min(...numericValues)
  const max = Math.max(...numericValues)
  const range = max - min || 1
  const usableWidth = CHART_WIDTH - PADDING * 2
  const usableHeight = CHART_HEIGHT - PADDING * 2
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0

  const points = values
    .map((value, index) => {
      if (value === null) {
        return null
      }
      const x = PADDING + index * step
      const y = PADDING + usableHeight - ((value - min) / range) * usableHeight
      return `${x},${y}`
    })
    .filter((point): point is string => point !== null)
    .join(' ')

  return { points, hasData: true }
}

export function CoreWebVitalsLineChart({
  hostname,
  history,
}: {
  hostname: string
  history: PerfMatrixHistoryPoint[]
}) {
  if (!history || history.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
        No historical Core Web Vitals data available for <span className="font-semibold">{hostname}</span>.
      </p>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {METRIC_CONFIG.map((metric) => {
        const values = history.map((point) => point[metric.key])
        const { points, hasData } = buildPoints(values)
        const latest = [...values].reverse().find((value) => value !== null) ?? null

        return (
          <div key={metric.key} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">{metric.label}</span>
              <span className="text-xs font-semibold text-slate-500">
                {latest !== null ? `${latest}${metric.unit}` : 'n/a'}
              </span>
            </div>
            <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${metric.label} trend`}>
              {hasData ? (
                <polyline points={points} fill="none" stroke={metric.color} strokeWidth={2} />
              ) : (
                <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  No data
                </text>
              )}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>{history[0]?.period}</span>
              <span>{history[history.length - 1]?.period}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
