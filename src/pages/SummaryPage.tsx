import { useEffect, useState } from 'react'
import { AccountsTable } from '../components/AccountsTable'
import { DashboardLayout } from '../components/DashboardLayout'
import { MetricTiles } from '../components/MetricTiles'
import { PanelColumns } from '../components/PanelColumns'
import { fetchSummaryDashboardData } from '../services/googleData'
import { accounts as mockAccounts, summaryMetrics as mockSummaryMetrics, summaryPanels as mockSummaryPanels } from '../data/mockData'
import type { SummaryDashboardData } from '../types/dashboard'

const INITIAL_DATA: SummaryDashboardData = {
  summaryMetrics: mockSummaryMetrics,
  accounts: mockAccounts,
  summaryPanels: mockSummaryPanels,
}

export function SummaryPage() {
  const [data, setData] = useState<SummaryDashboardData>(INITIAL_DATA)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      const nextData = await fetchSummaryDashboardData()
      if (isMounted) {
        setData(nextData)
        setIsLoading(false)
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <DashboardLayout title="Account Health & Growth Dashboard">
      <div className="space-y-6">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-card">
            Loading dashboard data...
          </div>
        ) : null}
        <MetricTiles metrics={data.summaryMetrics} />
        <AccountsTable rows={data.accounts} />
        <PanelColumns panels={data.summaryPanels} />
      </div>
    </DashboardLayout>
  )
}
