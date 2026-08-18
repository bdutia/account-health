import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { MetricTiles } from '../components/MetricTiles'
import { toneDotStyles, toneTextStyles } from '../components/tone'
import { fetchAccountDashboardData, fetchAccountHostnameCoverage } from '../services/googleData'
import type { AccountDetail, AccountHostnameCoverage } from '../types/dashboard'

function hostnameStatusStyles(status: 'covered' | 'not_covered' | 'unknown'): string {
  if (status === 'covered') {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (status === 'not_covered') {
    return 'bg-rose-100 text-rose-700'
  }
  return 'bg-slate-200 text-slate-700'
}

export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [hostnameCoverage, setHostnameCoverage] = useState<AccountHostnameCoverage | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      const [next, coverage] = await Promise.all([
        fetchAccountDashboardData(accountId),
        fetchAccountHostnameCoverage(accountId),
      ])
      if (isMounted) {
        setAccount(next ?? null)
        setHostnameCoverage(coverage)
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
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-800">Akamai Hostname Coverage</h2>
            {hostnameCoverage ? (
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                  Covered: {hostnameCoverage.totals.covered}
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                  Not Covered: {hostnameCoverage.totals.notCovered}
                </span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Unknown: {hostnameCoverage.totals.unknown}
                </span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">
                  Total: {hostnameCoverage.totals.total}
                </span>
              </div>
            ) : null}
          </div>

          <Link
            className="mb-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/hostname-cname-coverage`}
          >
            Run Hostname &amp; CNAME Coverage Scan →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/hostmatrix/cname`}
          >
            View Hostname CNAME Matrix →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/hostmatrix/cname/summary`}
          >
            View Hostname CNAME Matrix Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/featureMatrix`}
          >
            View Feature Matrix →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/featureMatrix/summary`}
          >
            View Feature Matrix Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/featureMatrix/scoreCard`}
          >
            View Feature Matrix ScoreCard →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/secHostCoverageMatrix`}
          >
            View Security Host Coverage Matrix →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/secHostCoverageMatrix/summary`}
          >
            View Security Host Coverage Matrix Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/secHostCoverageMatrix/scoreCard`}
          >
            View Security Host Coverage Matrix ScoreCard →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/trafficMatrix`}
          >
            View Traffic Matrix →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/trafficMatrix/summary`}
          >
            View Traffic Matrix Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/trafficMatrix/scoreCard`}
          >
            View Traffic Matrix ScoreCard →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrix`}
          >
            View Performance Matrix →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrix/summary`}
          >
            View Performance Matrix Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrix/scoreCard`}
          >
            View Performance Matrix ScoreCard →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrixTopN`}
          >
            View Performance Matrix (Top 10) →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrixTopN/summary`}
          >
            View Performance Matrix (Top 10) Summary →
          </Link>
          <Link
            className="mb-4 ml-4 inline-block text-sm font-semibold text-sky-700 underline"
            to={`/account/${accountId}/perfMatrixTopN/scoreCard`}
          >
            View Performance Matrix (Top 10) ScoreCard →
          </Link>

          {!hostnameCoverage ? (
            <p className="text-sm text-slate-600">
              Hostname coverage is unavailable for this account or this environment is not using backend mode.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-1 font-semibold">Hostname</th>
                    <th className="px-2 py-1 font-semibold">Status</th>
                    <th className="px-2 py-1 font-semibold">Security Config</th>
                    <th className="px-2 py-1 font-semibold">Policies</th>
                    <th className="px-2 py-1 font-semibold">Match Target</th>
                  </tr>
                </thead>
                <tbody>
                  {hostnameCoverage.hostnames.map((row) => (
                    <tr key={row.hostname} className="rounded-lg bg-slate-50 text-slate-700">
                      <td className="px-2 py-2 font-semibold">{row.hostname || '-'}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${hostnameStatusStyles(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-2 py-2">{row.securityConfiguration || '-'}</td>
                      <td className="px-2 py-2">{row.securityPolicies.length ? row.securityPolicies.join(', ') : '-'}</td>
                      <td className="px-2 py-2">{row.hasMatchTarget ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
