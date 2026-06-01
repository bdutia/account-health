import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { MetricTiles } from '../components/MetricTiles'
import { toneDotStyles, toneTextStyles } from '../components/tone'
import { fetchAccountDashboardData } from '../services/googleData'
import type { AccountDetail } from '../types/dashboard'

export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      const next = await fetchAccountDashboardData(accountId)
      if (isMounted) {
        setAccount(next ?? null)
        setIsLoading(false)
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [accountId])

  if (isLoading) {
    return (
      <DashboardLayout title="Loading Account...">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-card">
          Loading account details...
        </div>
      </DashboardLayout>
    )
  }

  if (!account) {
    return (
      <DashboardLayout title="Account Not Found">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-lg font-semibold text-rose-700">This account does not exist in the current dataset.</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-slate-700 underline" to="/">
            Go back to summary dashboard
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={account.name} owner={account.owner}>
      <div className="space-y-6">
        <MetricTiles metrics={account.heroMetrics} />
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-xl font-bold text-slate-800">Health Highlights</h2>
            <ul className="space-y-3">
              {account.highlights.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${toneDotStyles[item.tone]}`}></span>
                  <div>
                    <p className={`font-semibold ${toneTextStyles[item.tone]}`}>{item.label}</p>
                    <p>{item.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h2 className="mb-4 text-xl font-bold text-slate-800">Recommended Actions</h2>
            <ul className="space-y-3">
              {account.actions.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className={`font-semibold ${toneTextStyles[item.tone]}`}>{item.label}</p>
                  <p>{item.value}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {account.pillars.map((pillar) => (
            <article key={pillar.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <h3 className="mb-4 text-lg font-bold text-slate-800">{pillar.title}</h3>
              <ul className="space-y-3">
                {pillar.items.map((item) => (
                  <li key={item.id}>
                    <p className={`text-sm font-semibold ${toneTextStyles[item.tone]}`}>{item.label}</p>
                    <p className="text-sm text-slate-700">{item.value}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </DashboardLayout>
  )
}
