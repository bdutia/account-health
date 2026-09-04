import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { useArchive } from '../context/ArchiveContext'
import { fetchPerfMatrixTopNScoreCard, getPerfMatrixTopNDownloadUrl, PERF_MATRIX_TOPN_CSV_FILENAME } from '../services/perfMatrixTopNJobs'
import type { CsvDataMode, PerfMatrixTopNScoreCardResult } from '../types/dashboard'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed'

const RATING_STYLES: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-700',
  'needs-improvement': 'bg-amber-100 text-amber-700',
  poor: 'bg-rose-100 text-rose-700',
}

function ratingBadge(rating: string | null) {
  if (!rating) {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">n/a</span>
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RATING_STYLES[rating] ?? 'bg-slate-200 text-slate-700'}`}>
      {rating}
    </span>
  )
}

export function PerfMatrixTopNScoreCardPage() {
  const { accountId = '' } = useParams()
  const dataMode: CsvDataMode = 'csv_data_remote'
  const { archive: context, contextPath } = useArchive()
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [result, setResult] = useState<PerfMatrixTopNScoreCardResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostnameFilter, setHostnameFilter] = useState('')
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function run() {
      setStatus('loading')
      setResult(null)
      setError(null)

      try {
        const data = await fetchPerfMatrixTopNScoreCard(accountId, dataMode, context || undefined)
        if (!isMounted) {
          return
        }
        setResult(data)
        setStatus('loaded')
      } catch (fetchError) {
        if (isMounted) {
          setStatus('failed')
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch perf matrix (Top N) scoreCard')
        }
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [accountId, dataMode, context])

  const filteredHostnames = useMemo(() => {
    if (!result) {
      return []
    }
    const query = hostnameFilter.trim().toLowerCase()
    if (!query) {
      return result.hostnames
    }
    return result.hostnames.filter((entry) => entry.hostname.toLowerCase().includes(query))
  }, [result, hostnameFilter])

  return (
    <DashboardLayout title="Performance Matrix ScoreCard — Top 10 Hostnames">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/perfMatrixTopN?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Table →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/perfMatrixTopN/summary?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Summary →
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">ScoreCard</h2>
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
                {status === 'loading' ? 'Loading…' : status === 'loaded' ? 'Loaded' : status === 'failed' ? 'Failed' : ''}
              </span>
            </div>
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        </section>

        {result ? (
          <p className="text-xs font-semibold text-slate-600">
            You can download the data used in this dashboard here:{' '}
            <a
              className="text-sky-700 underline"
              href={getPerfMatrixTopNDownloadUrl(accountId, context || undefined)}
              target="_blank"
              rel="noreferrer"
            >
              {PERF_MATRIX_TOPN_CSV_FILENAME}
            </a>
          </p>
        ) : null}

        {result ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Hostnames: {result.totals.hostnames}</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Avg LCP: {result.totals.corewebvitals.lcpMsAvg !== null ? `${result.totals.corewebvitals.lcpMsAvg}ms` : 'n/a'}
                </span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Avg INP: {result.totals.corewebvitals.inpMsAvg !== null ? `${result.totals.corewebvitals.inpMsAvg}ms` : 'n/a'}
                </span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
                  Avg CLS: {result.totals.corewebvitals.clsAvg !== null ? result.totals.corewebvitals.clsAvg : 'n/a'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  placeholder="Filter hostname..."
                  value={hostnameFilter}
                  onChange={(event) => setHostnameFilter(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRawJson((previous) => !previous)}
                  className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                >
                  {showRawJson ? 'Hide raw JSON' : 'Show raw JSON'}
                </button>
              </div>
            </div>

            {showRawJson ? (
              <pre className="mb-4 max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-emerald-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-2 py-1 font-semibold">Hostname</th>
                      <th className="px-2 py-1 font-semibold">Source</th>
                      <th className="px-2 py-1 font-semibold">LCP</th>
                      <th className="px-2 py-1 font-semibold">INP</th>
                      <th className="px-2 py-1 font-semibold">CLS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHostnames.map((entry) => (
                      <tr key={entry.hostname} className="rounded-lg bg-slate-50 text-slate-700">
                        <td className="px-2 py-2 font-semibold">{entry.hostname}</td>
                        <td className="px-2 py-2">{entry.corewebvitals.source ?? 'n/a'}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span>{entry.corewebvitals.lcpMs !== null ? `${entry.corewebvitals.lcpMs}ms` : 'n/a'}</span>
                            {ratingBadge(entry.corewebvitals.lcpRating)}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span>{entry.corewebvitals.inpMs !== null ? `${entry.corewebvitals.inpMs}ms` : 'n/a'}</span>
                            {ratingBadge(entry.corewebvitals.inpRating)}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span>{entry.corewebvitals.cls !== null ? entry.corewebvitals.cls : 'n/a'}</span>
                            {ratingBadge(entry.corewebvitals.clsRating)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
