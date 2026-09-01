import { useMemo, useState } from 'react'
import type { SecurityTrendSeriesPoint } from '../types/dashboard'

const PALETTE = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#ec4899', '#14b8a6']

export function securityTrendDimensionColor(dimension: string, dimensions: string[]): string {
  const index = dimensions.indexOf(dimension)
  return index === -1 ? '#64748b' : PALETTE[index % PALETTE.length]
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 280
const PADDING = 40

export function SecurityTrendLineChart({
  series,
  dimensions,
}: {
  series: Record<string, SecurityTrendSeriesPoint[]>
  dimensions: string[]
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const labels = useMemo(() => {
    for (const dimension of dimensions) {
      const points = series[dimension]
      if (points?.length) {
        return points.map((point) => point.date)
      }
    }
    return []
  }, [series, dimensions])

  const { min, max } = useMemo(() => {
    let minValue = Infinity
    let maxValue = -Infinity
    for (const dimension of dimensions) {
      for (const point of series[dimension] ?? []) {
        if (point.value === null) {
          continue
        }
        minValue = Math.min(minValue, point.value)
        maxValue = Math.max(maxValue, point.value)
      }
    }
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return { min: 0, max: 1 }
    }
    if (minValue === maxValue) {
      return { min: minValue - 1, max: maxValue + 1 }
    }
    return { min: minValue, max: maxValue }
  }, [series, dimensions])

  if (dimensions.length === 0 || labels.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No chart data available.</p>
  }

  const usableWidth = CHART_WIDTH - PADDING * 2
  const usableHeight = CHART_HEIGHT - PADDING * 2
  const range = max - min || 1
  const step = labels.length > 1 ? usableWidth / (labels.length - 1) : 0
  const labelStride = labels.length > 12 ? Math.ceil(labels.length / 12) : 1

  function xFor(index: number): number {
    return PADDING + index * step
  }
  function yFor(value: number): number {
    return PADDING + usableHeight - ((value - min) / range) * usableHeight
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          width="100%"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label="Security trend chart"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = PADDING + usableHeight * fraction
            const value = max - range * fraction
            return (
              <g key={fraction}>
                <line x1={PADDING} y1={y} x2={CHART_WIDTH - PADDING} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text x={PADDING - 6} y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
                  {Math.round(value * 100) / 100}
                </text>
              </g>
            )
          })}

          {dimensions.map((dimension) => {
            const points = series[dimension] ?? []
            const color = securityTrendDimensionColor(dimension, dimensions)
            const path = points
              .map((point, index) => (point.value === null ? null : `${xFor(index)},${yFor(point.value)}`))
              .filter((segment): segment is string => segment !== null)
              .join(' ')
            return (
              <polyline
                key={dimension}
                points={path}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )
          })}

          {hoverIndex !== null ? (
            <line
              x1={xFor(hoverIndex)}
              y1={PADDING}
              x2={xFor(hoverIndex)}
              y2={CHART_HEIGHT - PADDING}
              stroke="#94a3b8"
              strokeDasharray="4 4"
            />
          ) : null}

          {labels.map((_, index) => (
            <rect
              key={index}
              x={xFor(index) - step / 2}
              y={PADDING}
              width={step || usableWidth}
              height={usableHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(index)}
            />
          ))}

          {labels.map((label, index) =>
            index % labelStride === 0 ? (
              <text
                key={`${label}-${index}`}
                x={xFor(index)}
                y={CHART_HEIGHT - PADDING + 16}
                textAnchor="middle"
                className="fill-slate-400 text-[9px]"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
        <p className="mb-1 font-semibold text-slate-700">{hoverIndex !== null ? labels[hoverIndex] : 'Hover the chart for values'}</p>
        <div className="flex flex-wrap gap-3">
          {dimensions.map((dimension) => (
            <span key={dimension} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: securityTrendDimensionColor(dimension, dimensions) }}
              />
              <span className="font-semibold text-slate-600">{dimension}:</span>
              <span className="text-slate-500">
                {hoverIndex !== null ? series[dimension]?.[hoverIndex]?.value ?? 'n/a' : '—'}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
