import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import {
  startHostnameCnameCoverageJob,
  subscribeToHostnameCnameCoverageJob,
} from '../services/hostnameCnameJobs'
import type { HostnameCnameCoverageResult, JobProgressEvent, JobProgressLevel } from '../types/dashboard'

interface LogEntry {
  message: string
  level: JobProgressLevel
  timestamp: number
}

type JobStatus = 'idle' | 'running' | 'completed' | 'failed'

const LOG_LEVEL_STYLES: Record<JobProgressLevel, string> = {
  info: 'text-slate-600',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  error: 'text-rose-700',
}

const RECORD_TYPE_STYLES: Record<string, string> = {
  CNAME: 'bg-emerald-100 text-emerald-700',
  A: 'bg-sky-100 text-sky-700',
  NONE: 'bg-slate-200 text-slate-700',
  ERROR: 'bg-rose-100 text-rose-700',
}

export function HostnameCnameCoveragePage() {
  const { accountId = '' } = useParams()
  const [status, setStatus] = useState<JobStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<HostnameCnameCoverageResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [propertyFilter, setPropertyFilter] = useState('')
  const [hostnameFilter, setHostnameFilter] = useState('')

  useEffect(() => {
    let isMounted = true
    let unsubscribe: (() => void) | undefined

    async function run() {
      setStatus('running')
      setPercent(0)
      setLogs([])
      setResult(null)
      setError(null)
      setPropertyFilter('')
      setHostnameFilter('')

      try {
        const jobId = await startHostnameCnameCoverageJob(accountId)
        if (!isMounted) {
          return
        }

        unsubscribe = subscribeToHostnameCnameCoverageJob(accountId, jobId, (event: JobProgressEvent) => {
          if (!isMounted) {
            return
          }

          if (event.type === 'progress') {
            setPercent(event.percent)
            setLogs((previous) => [...previous, { message: event.message, level: event.level, timestamp: event.timestamp }])
            return
          }

          if (event.type === 'completed') {
            setPercent(100)
            setStatus('completed')
            setResult(event.result)
            return
          }

          setStatus('failed')
          setError(event.message)
        })
      } catch (startError) {
        if (isMounted) {
          setStatus('failed')
          setError(startError instanceof Error ? startError.message : 'Failed to start job')
        }
      }
    }

    void run()

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [accountId])

  const propertyOptions = useMemo(() => (result ? [...result.properties].sort() : []), [result])
  const hostnameOptions = useMemo(() => (result ? [...result.hostnames].sort() : []), [result])

  const filteredRows = useMemo(() => {
    if (!result) {
      return []
    }
    return result.rows.filter((row) => {
      if (propertyFilter && row.propertyName !== propertyFilter) {
        return false
      }
      if (hostnameFilter && row.hostname !== hostnameFilter) {
        return false
      }
      return true
    })
  }, [result, propertyFilter, hostnameFilter])

  return (
    <DashboardLayout title="Hostname & CNAME Coverage">
      <div className="space-y-6">
        <Link className="text-sm font-semibold text-slate-700 underline" to={`/account/${accountId}`}>
          ← Back to account
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Scan Progress</h2>
            <span className="text-sm font-semibold text-slate-600">
              {status === 'running' ? `Running… ${percent}%` : status === 'completed' ? 'Completed' : status === 'failed' ? 'Failed' : ''}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-300 ${status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}

          <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 font-mono text-xs">
            {logs.map((log, index) => (
              <li key={`${log.timestamp}-${index}`} className={LOG_LEVEL_STYLES[log.level]}>
                {log.message}
              </li>
            ))}
          </ul>
        </section>

        {result ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">Feature Matrix</h2>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">CNAME: {result.totals.cname}</span>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">A Record: {result.totals.aRecord}</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">Unresolved: {result.totals.unresolved}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-white">Total: {result.totals.hostnames}</span>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Property:
                <select
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  value={propertyFilter}
                  onChange={(event) => setPropertyFilter(event.target.value)}
                >
                  <option value="">All Properties</option>
                  {propertyOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Hostname:
                <select
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal"
                  value={hostnameFilter}
                  onChange={(event) => setHostnameFilter(event.target.value)}
                >
                  <option value="">All Hostnames</option>
                  {hostnameOptions.map((hostname) => (
                    <option key={hostname} value={hostname}>
                      {hostname}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs font-semibold text-slate-500">
                {filteredRows.length} of {result.rows.length} rows
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-1 font-semibold">Property</th>
                    <th className="px-2 py-1 font-semibold">Hostname</th>
                    <th className="bg-amber-50 px-2 py-1 font-semibold">Origin Servers</th>
                    <th className="bg-amber-50 px-2 py-1 font-semibold">Behaviors</th>
                    <th className="px-2 py-1 font-semibold">Staging Activated</th>
                    <th className="px-2 py-1 font-semibold">Production Activated</th>
                    <th className="bg-sky-50 px-2 py-1 font-semibold">Resolved CNAME / IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${row.propertyId}-${row.hostname}-${index}`} className="rounded-lg bg-slate-50 text-slate-700">
                      <td className="px-2 py-2 font-semibold">{row.propertyName || '-'}</td>
                      <td className="px-2 py-2">{row.hostname || '-'}</td>
                      <td className="bg-amber-50/50 px-2 py-2">{row.originServers || '-'}</td>
                      <td className="bg-amber-50/50 px-2 py-2">{row.behaviors || '-'}</td>
                      <td className="px-2 py-2">
                        {row.stagingActivatedAt ? `${row.stagingActivatedAt} (${row.stagingActivatedBy || 'unknown'})` : '-'}
                      </td>
                      <td className="px-2 py-2">
                        {row.productionActivatedAt
                          ? `${row.productionActivatedAt} (${row.productionActivatedBy || 'unknown'})`
                          : '-'}
                      </td>
                      <td className="bg-sky-50/50 px-2 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${RECORD_TYPE_STYLES[row.recordType ?? 'NONE']}`}
                        >
                          {row.resolvedValue || 'unresolved'} ({row.recordType ?? 'NONE'})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  )
}
