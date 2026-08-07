export type HealthTone = 'healthy' | 'watch' | 'risk' | 'neutral'

export interface SummaryMetric {
  id: string
  title: string
  value: string
  subtitle: string
  tone: HealthTone
}

export interface AccountSummaryRow {
  accountId: string
  name: string
  healthScore: {
    value: number
    tone: HealthTone
  }
  renewalRisk: string
  expansionPotential: string
  technicalMaturity: string
  deliveryHealth: string
  execAttention: string
}

export interface PanelItem {
  id: string
  label: string
  value: string
  tone: HealthTone
}

export interface SummaryPanel {
  id: string
  title: string
  items: PanelItem[]
}

export interface DetailPillar {
  id: string
  title: string
  items: PanelItem[]
}

export interface HostnameCoverageTotals {
  covered: number
  notCovered: number
  unknown: number
  total: number
}

export interface HostnameCoverageRow {
  hostname: string
  status: 'covered' | 'not_covered' | 'unknown'
  securityConfiguration?: string
  hasMatchTarget: boolean
  securityPolicies: string[]
}

export interface AccountHostnameCoverage {
  accountKey: string
  accountName: string
  accountId: string
  totals: HostnameCoverageTotals
  hostnames: HostnameCoverageRow[]
}

export interface AccountDetail {
  accountId: string
  name: string
  owner: string
  quarter: string
  heroMetrics: SummaryMetric[]
  highlights: PanelItem[]
  actions: PanelItem[]
  pillars: DetailPillar[]
}

export interface SummaryDashboardData {
  summaryMetrics: SummaryMetric[]
  accounts: AccountSummaryRow[]
  summaryPanels: SummaryPanel[]
}
