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

export type DnsRecordType = 'CNAME' | 'A' | 'NONE' | 'ERROR'

export interface HostnameCnameRow {
  propertyId?: string
  propertyName?: string
  contractId?: string
  groupId?: string
  propertyVersion?: string
  hostname: string
  originServers?: string
  behaviors?: string
  stagingActivatedAt?: string
  stagingActivatedBy?: string
  productionActivatedAt?: string
  productionActivatedBy?: string
  resolvedValue?: string
  recordType?: DnsRecordType
}

export interface HostnameCnameCoverageTotals {
  hostnames: number
  cname: number
  aRecord: number
  unresolved: number
}

export interface HostnameCnameCoverageResult {
  accountKey: string
  accountName: string
  accountId: string
  totals: HostnameCnameCoverageTotals
  properties: string[]
  hostnames: string[]
  rows: HostnameCnameRow[]
}

export type JobProgressLevel = 'info' | 'success' | 'warning' | 'error'

export type JobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: HostnameCnameCoverageResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export type CsvDataMode = 'csv_data_local' | 'csv_data_remote'

export interface HostnameCnameMatrixTotals {
  rows: number
  hostnames: number
}

export interface HostnameCnameMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  hostnames: string[]
  rows: Array<Record<string, string>>
  totals: HostnameCnameMatrixTotals
}

export type HostnameCnameMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: HostnameCnameMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

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
