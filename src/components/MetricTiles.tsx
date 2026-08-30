import { toneBadgeStyles, toneTextStyles } from './tone'
import type { SummaryMetric } from '../types/dashboard'

interface MetricTilesProps {
  metrics: SummaryMetric[]
}

export function MetricTiles({ metrics }: MetricTilesProps) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-card md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <article key={metric.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{metric.title}</p>
          <div className="mt-3 flex items-end gap-2">
            <p className={`text-3xl font-bold ${toneTextStyles[metric.tone]}`}>{metric.value}</p>
            <span className={`mb-1 rounded-full border px-2 py-0.5 text-xs font-bold ${toneBadgeStyles[metric.tone]}`}>
              {metric.subtitle}
            </span>
          </div>
        </article>
      ))}
    </section>
  )
}
