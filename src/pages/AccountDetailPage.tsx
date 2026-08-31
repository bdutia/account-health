import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { HealthWidgetLink } from '../components/HealthWidgetLink'
import { MetricTiles } from '../components/MetricTiles'
import { toneDotStyles, toneTextStyles } from '../components/tone'
import { fetchAccountDashboardData, fetchAccountHostnameCoverage } from '../services/googleData'
import { fetchNsAccountDashboardData } from '../services/netstorageData'
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
  const [searchParams] = useSearchParams()
  const archive = searchParams.get('archive') ?? ''
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [hostnameCoverage, setHostnameCoverage] = useState<AccountHostnameCoverage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dataSourceLabel, setDataSourceLabel] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setIsLoading(true)
      const [nsResult, coverage] = await Promise.all([
        fetchNsAccountDashboardData(accountId, archive || undefined),
        fetchAccountHostnameCoverage(accountId),
      ])

      if (!isMounted) {
        return
      }

      if (nsResult.data) {
        setAccount(nsResult.data)
        setDataSourceLabel(
          nsResult.source === 'netstorage-archive' ? `NetStorage Archive (${nsResult.context})` : 'NetStorage Live',
        )
        setHostnameCoverage(coverage)
        setIsLoading(false)
        return
      }

      const fallbackAccount = await fetchAccountDashboardData(accountId)
      if (isMounted) {
        setAccount(fallbackAccount ?? null)
        setDataSourceLabel(nsResult.error ? `Fallback data — NetStorage unavailable (${nsResult.error})` : null)
        setHostnameCoverage(coverage)
        setIsLoading(false)
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [accountId, archive])


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
        {dataSourceLabel ? (
          <p className="text-center text-xs font-semibold text-slate-500">Data source: {dataSourceLabel}</p>
        ) : null}
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
            <h2 className="text-xl font-bold text-slate-800">Account Health Diagnosis & Surgical Tool Box</h2>
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

          <div className="mb-6 space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-sky-700">
                Hostname &amp; CNAME Pulse Monitoring
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="pulseMonitor"
                  to={`/account/${accountId}/hostmatrix/cname`}
                  title="Hostname Diagnostic Score Card"
                  description="View Hostname CNAME Matrix"
                />
                <HealthWidgetLink
                  variant="pulseMonitor"
                  to={`/account/${accountId}/hostmatrix/cname/summary`}
                  title="Hostname Summary"
                  description="View Hostname CNAME Matrix Summary"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-rose-700">
                Feature Matrix Heart Rate Diagnosis
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="heartbeat"
                  to={`/account/${accountId}/featureMatrix`}
                  title="Feature Matrix"
                  description="View Feature Matrix"
                />
                <HealthWidgetLink
                  variant="heartbeat"
                  to={`/account/${accountId}/featureMatrix/summary`}
                  title="Feature Summary"
                  description="View Feature Matrix Summary"
                />
                <HealthWidgetLink
                  variant="heartbeat"
                  to={`/account/${accountId}/featureMatrix/scoreCard`}
                  title="Feature Score Card"
                  description="View Feature Matrix ScoreCard"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-indigo-700">
                Traffic Matrix DNA Scan
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="dnaHelix"
                  to={`/account/${accountId}/trafficMatrix`}
                  title="Traffic Matrix"
                  description="View Traffic Matrix"
                />
                <HealthWidgetLink
                  variant="dnaHelix"
                  to={`/account/${accountId}/trafficMatrix/summary`}
                  title="Traffic Matrix Summary"
                  description="View Traffic Matrix Summary"
                />
                <HealthWidgetLink
                  variant="dnaHelix"
                  to={`/account/${accountId}/trafficMatrix/scoreCard`}
                  title="Traffic Matrix Score Card"
                  description="View Traffic Matrix ScoreCard"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-teal-700">
                Performance Matrix Stethoscope Check
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="stethoscope"
                  to={`/account/${accountId}/perfMatrixTopN`}
                  title="Performance Matrix (Top 10)"
                  description="View Performance Matrix (Top 10)"
                />
                <HealthWidgetLink
                  variant="stethoscope"
                  to={`/account/${accountId}/perfMatrixTopN/summary`}
                  title="Performance Matrix (Top 10) Summary"
                  description="View Performance Matrix (Top 10) Summary"
                />
                <HealthWidgetLink
                  variant="stethoscope"
                  to={`/account/${accountId}/perfMatrixTopN/scoreCard`}
                  title="Performance Matrix (Top 10) Score Card"
                  description="View Performance Matrix (Top 10) ScoreCard"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-700">
                Security Host Coverage Pulse
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="securityPulse"
                  to={`/account/${accountId}/secHostCoverageMatrix`}
                  title="Security Host Coverage Matrix"
                  description="View Security Host Coverage Matrix"
                />
                <HealthWidgetLink
                  variant="securityPulse"
                  to={`/account/${accountId}/secHostCoverageMatrix/summary`}
                  title="Security Host Coverage Summary"
                  description="View Security Host Coverage Matrix Summary"
                />
                <HealthWidgetLink
                  variant="securityPulse"
                  to={`/account/${accountId}/secHostCoverageMatrix/scoreCard`}
                  title="Security Host Coverage Score Card"
                  description="View Security Host Coverage Matrix ScoreCard"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-red-700">
                WSA Alert Matrix — Security Alert Scan
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <HealthWidgetLink
                  variant="securityAlert"
                  to={`/account/${accountId}/wsaAlertMatrix`}
                  title="WSA Alert Matrix"
                  description="View WSA Alert Config &amp; Feature Table"
                />
                <HealthWidgetLink
                  variant="securityAlert"
                  to={`/account/${accountId}/wsaAlertMatrix/summary`}
                  title="WSA Alert Summary"
                  description="View WSA Alert Matrix Summary"
                />
                <HealthWidgetLink
                  variant="securityAlert"
                  to={`/account/${accountId}/wsaAlertMatrix/scoreCard`}
                  title="WSA Alert Score Card"
                  description="View WSA Alert Matrix ScoreCard"
                />
              </div>
            </div>
          </div>

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
