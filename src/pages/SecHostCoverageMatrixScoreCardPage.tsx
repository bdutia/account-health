import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { useArchive } from '../context/ArchiveContext'
import { fetchSecHostCoverageMatrixScoreCard, getSecHostCoverageMatrixDownloadUrl, SEC_HOST_COVERAGE_MATRIX_CSV_FILENAME } from '../services/secHostCoverageMatrixJobs'
import type { CsvDataMode, SecHostCoverageMatrixScoreCardResult } from '../types/dashboard'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export function SecHostCoverageMatrixScoreCardPage() {
  const { accountId = '' } = useParams()
  const dataMode: CsvDataMode = 'csv_data_remote'
  const { archive: context, contextPath } = useArchive()
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [result, setResult] = useState<SecHostCoverageMatrixScoreCardResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [configFilter, setConfigFilter] = useState('')
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function run() {
      setStatus('loading')
      setResult(null)
      setError(null)

      try {
        const data = await fetchSecHostCoverageMatrixScoreCard(accountId, dataMode, context || undefined)
        if (!isMounted) {
          return
        }
        setResult(data)
        setStatus('loaded')
      } catch (fetchError) {
        if (isMounted) {
          setStatus('failed')
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch security host coverage matrix scoreCard')
        }
      }
    }

    void run()

    return () => {
      isMounted = false
    }
  }, [accountId, dataMode, context])

  const filteredGroups = useMemo(() => {
    if (!result) {
      return []
    }
    const query = configFilter.trim().toLowerCase()
    if (!query) {
      return result.secHostCoverageMatrix
    }
    return result.secHostCoverageMatrix.filter((group) => group.configName.toLowerCase().includes(query))
  }, [result, configFilter])

  return (
    <DashboardLayout title="Security Host Coverage Matrix ScoreCard">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
            ← Back to account
          </Link>
          <div className="flex flex-wrap gap-4">
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/secHostCoverageMatrix?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
            >
              View Table →
            </Link>
            <Link
              className="text-sm font-semibold text-sky-700 underline"
              to={`/account/${accountId}/secHostCoverageMatrix/summary?data=${dataMode}${context ? `&context=${encodeURIComponent(context)}` : ''}`}
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
              href={getSecHostCoverageMatrixDownloadUrl(accountId, context || undefined)}
              target="_blank"
              rel="noreferrer"
            >
              {SEC_HOST_COVERAGE_MATRIX_CSV_FILENAME}
            </a>
          </p>
        ) : null}

        {result ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Hostnames: {result.totals.hostnames}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Configs: {result.totals.configNames}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  placeholder="Filter config name..."
                  value={configFilter}
                  onChange={(event) => setConfigFilter(event.target.value)}
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredGroups.map((group) => (
                  <article key={group.configName} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <button
                      type="button"
                      onClick={() => setExpandedConfig(expandedConfig === group.configName ? null : group.configName)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-sm font-bold text-slate-800">{group.configName}</span>
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                        {group.count}
                      </span>
                    </button>
                    {expandedConfig === group.configName ? (
                      <div className="mt-3 space-y-3 text-xs text-slate-700">
                        <div>
                          <p className="mb-1 font-semibold text-slate-500">
                            Attack Groups in Alert ({group.attackGroupAlert.length})
                          </p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto">
                            {group.attackGroupAlert.length === 0 ? (
                              <li className="italic text-slate-400">No hostnames with Attack Groups in Alert</li>
                            ) : (
                              group.attackGroupAlert.map((entry, index) => (
                                <li
                                  key={`${entry.hostname}-${index}`}
                                  className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1"
                                >
                                  <span className="truncate font-semibold">{entry.hostname}</span>
                                  <span className="truncate text-slate-500">{entry.status}</span>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-slate-500">
                            Attack Groups in Deny ({group.attackGroupDeny.length})
                          </p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto">
                            {group.attackGroupDeny.length === 0 ? (
                              <li className="italic text-slate-400">No hostnames with Attack Groups in Deny</li>
                            ) : (
                              group.attackGroupDeny.map((entry, index) => (
                                <li
                                  key={`${entry.hostname}-${index}`}
                                  className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1"
                                >
                                  <span className="truncate font-semibold">{entry.hostname}</span>
                                  <span className="truncate text-slate-500">{entry.status}</span>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
