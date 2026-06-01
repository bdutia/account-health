import { toneDotStyles, toneTextStyles } from './tone'
import type { SummaryPanel } from '../types/dashboard'

interface PanelColumnsProps {
  panels: SummaryPanel[]
}

export function PanelColumns({ panels }: PanelColumnsProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {panels.map((panel) => (
        <article key={panel.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <h3 className="mb-4 text-lg font-bold text-slate-800">{panel.title}</h3>
          <ul className="space-y-2">
            {panel.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${toneDotStyles[item.tone]}`}></span>
                  <p className={`font-semibold ${toneTextStyles[item.tone]}`}>{item.label}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.value}</p>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  )
}
