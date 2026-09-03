import { useEffect, useState } from 'react'
import { AccountsTable } from '../components/AccountsTable'
import { DashboardLayout } from '../components/DashboardLayout'
import { MetricTiles } from '../components/MetricTiles'
import { PanelColumns } from '../components/PanelColumns'
import { useArchive } from '../context/ArchiveContext'
import { fetchSummaryDashboardData } from '../services/googleData'
import { fetchNsSummaryDashboardData } from '../services/netstorageData'
import { accounts as mockAccounts, summaryMetrics as mockSummaryMetrics, summaryPanels as mockSummaryPanels } from '../data/mockData'
import type { SummaryDashboardData } from '../types/dashboard'

const INITIAL_DATA: SummaryDashboardData = {
  summaryMetrics: mockSummaryMetrics,
  accounts: mockAccounts,
  summaryPanels: mockSummaryPanels,
}

export function SummaryPage() {
  const { archive } = useArchive()
  const [data, setData] = useState<SummaryDashboardData>(INITIAL_DATA)
  const [isLoading, setIsLoading] = useState(true)
  const [dataSourceLabel, setDataSourceLabel] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setIsLoading(true)
      const nsResult = await fetchNsSummaryDashboardData(archive || undefined)

      if (!isMounted) {
        return
      }

      if (nsResult.data) {
        setData(nsResult.data)
        setDataSourceLabel(
          nsResult.source === 'netstorage-archive' ? `NetStorage Archive (${nsResult.context})` : 'NetStorage Live',
        )
        setIsLoading(false)
        return
      }

      const fallbackData = await fetchSummaryDashboardData()
      if (isMounted) {
        setData(fallbackData)
        setDataSourceLabel(nsResult.error ? `Fallback data — NetStorage unavailable (${nsResult.error})` : null)
        setIsLoading(false)
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [archive])

  return (
    <DashboardLayout title="Account Health & Growth Dashboard">
      <div className="space-y-6">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-card">
            Loading dashboard data...
          </div>
        ) : null}
        {dataSourceLabel ? (
          <p className="text-center text-xs font-semibold text-slate-500">Data source: {dataSourceLabel}</p>
        ) : null}
        <MetricTiles metrics={data.summaryMetrics} />
        <AccountsTable rows={data.accounts} />
        <PanelColumns panels={data.summaryPanels} />
      </div>
    </DashboardLayout>
  )
}

