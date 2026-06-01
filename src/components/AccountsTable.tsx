import { Link } from 'react-router-dom'
import { toneBadgeStyles, toneTextStyles } from './tone'
import type { AccountSummaryRow, HealthTone } from '../types/dashboard'

interface AccountsTableProps {
  rows: AccountSummaryRow[]
}

function statusToTone(status: string): HealthTone {
  const lower = status.toLowerCase()
  if (lower.includes('risk') || lower.includes('off track') || lower.includes('escalation')) return 'risk'
  if (lower.includes('healthy') || lower.includes('track') || lower.includes('growth') || lower.includes('expansion')) {
    return 'healthy'
  }
  if (lower.includes('limited') || lower.includes('review') || lower.includes('push') || lower.includes('opportunity')) {
    return 'watch'
  }
  return 'neutral'
}

export function AccountsTable({ rows }: AccountsTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-slate-800">Account Overview</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-3 pr-4">Account</th>
              <th className="pb-3 pr-4">Health Score</th>
              <th className="pb-3 pr-4">Renewal Risk</th>
              <th className="pb-3 pr-4">Expansion Potential</th>
              <th className="pb-3 pr-4">Technical Maturity</th>
              <th className="pb-3 pr-4">Delivery Health</th>
              <th className="pb-3">Exec Attention</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.accountId} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-3 pr-4 font-semibold text-slate-900">
                  <Link className="hover:text-sky-700 hover:underline" to={`/account/${row.accountId}`}>
                    {row.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full border px-3 py-1 font-semibold ${toneBadgeStyles[row.healthScore.tone]}`}>
                    {row.healthScore.value}
                  </span>
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.renewalRisk)]}`}>
                  {row.renewalRisk}
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.expansionPotential)]}`}>
                  {row.expansionPotential}
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-700">{row.technicalMaturity}</span>
                </td>
                <td className={`py-3 pr-4 font-semibold ${toneTextStyles[statusToTone(row.deliveryHealth)]}`}>
                  {row.deliveryHealth}
                </td>
                <td className="py-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{row.execAttention}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
