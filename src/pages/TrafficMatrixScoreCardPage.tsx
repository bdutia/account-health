import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { fetchTrafficMatrixScoreCard, getTrafficMatrixDownloadUrl, TRAFFIC_MATRIX_CSV_FILENAME } from '../services/trafficMatrixJobs'
import type { CsvDataMode, TrafficMatrixScoreCardResult } from '../types/dashboard'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed'

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

export function TrafficMatrixScoreCardPage() {
  const { accountId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const dataMode: CsvDataMode = 'csv_data_remote'
  const [context, setContext] = useState(searchParams.get('context') ?? '')
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [result, setResult] = useState<TrafficMatrixScoreCardResult | null>(null)
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
        const data = await fetchTrafficMatrixScoreCard(accountId, dataMode, context || undefined)
        if (!isMounted) {
          return
        }
        setResult(data)
        setStatus('loaded')
      } catch (fetchError) {
        if (isMounted) {
          setStatus('failed')
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch traffic matrix scoreCard')
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
    <DashboardLayout title="Traffic Matrix ScoreCard">
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
              to={`/account/${accountId}/trafficMatrix/summary?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
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
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Context (NS base path):
                <input
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  placeholder="e.g. staticSiteContent"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              </label>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
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
                      <th className="px-2 py-1 font-semibold">Edge Hits</th>
                      <th className="px-2 py-1 font-semibold">Origin Hits</th>
                      <th className="px-2 py-1 font-semibold">Edge Bytes</th>
                      <th className="px-2 py-1 font-semibold">Origin Bytes</th>
                      <th className="px-2 py-1 font-semibold">Hits Offload</th>
                      <th className="px-2 py-1 font-semibold">Bytes Offload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHostnames.map((entry) => (
                      <tr key={entry.hostname} className="rounded-lg bg-slate-50 text-slate-700">
                        <td className="px-2 py-2 font-semibold">{entry.hostname}</td>
                        <td className="px-2 py-2">{formatCompactNumber(entry.edgeHits)}</td>
                        <td className="px-2 py-2">{formatCompactNumber(entry.originHits)}</td>
                        <td className="px-2 py-2">{formatCompactNumber(entry.edgeBytes)}</td>
                        <td className="px-2 py-2">{formatCompactNumber(entry.originBytes)}</td>
                        <td className="px-2 py-2">{entry.hitsOffload.toFixed(2)}</td>
                        <td className="px-2 py-2">{entry.bytesOffload.toFixed(2)}</td>
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
