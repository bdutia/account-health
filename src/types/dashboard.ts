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

export interface HostnameCnameMatrixSummaryTotals {
  rows: number
  hostnames: number
  covered: number
  notCovered: number
}

export interface HostnameCnameMatrixBreakdownItem {
  value: string
  count: number
}

export interface HostnameCnameMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  totals: HostnameCnameMatrixSummaryTotals
  breakdowns: Record<string, HostnameCnameMatrixBreakdownItem[]>
}

export type HostnameCnameMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: HostnameCnameMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface FeatureMatrixTotals {
  rows: number
  properties: number
  features: number
}

export interface FeatureMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  featureColumns: string[]
  properties: string[]
  rows: Array<Record<string, string>>
  totals: FeatureMatrixTotals
}

export type FeatureMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: FeatureMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface FeatureMatrixSummaryTotals {
  rows: number
  properties: number
  features: number
  enabled: number
  disabled: number
}

export interface FeatureMatrixBreakdownItem {
  value: string
  count: number
}

export interface FeatureMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  featureColumns: string[]
  totals: FeatureMatrixSummaryTotals
  breakdowns: Record<string, FeatureMatrixBreakdownItem[]>
}

export type FeatureMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: FeatureMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface FeatureMatrixScoreCardEntry {
  propertyName: string
  status: string
}

export interface FeatureMatrixScoreCardFeature {
  featureName: string
  count: number
  properties: FeatureMatrixScoreCardEntry[]
}

export interface FeatureMatrixScoreCardTotals {
  properties: number
  features: number
}

export interface FeatureMatrixScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  featureMatrix: FeatureMatrixScoreCardFeature[]
  totals: FeatureMatrixScoreCardTotals
}

export interface SecHostCoverageMatrixTotals {
  rows: number
  hostnames: number
  configNames: number
  covered: number
  notCovered: number
}

export interface SecHostCoverageMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  metricColumns: string[]
  hostnames: string[]
  configNames: string[]
  rows: Array<Record<string, string>>
  totals: SecHostCoverageMatrixTotals
}

export type SecHostCoverageMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: SecHostCoverageMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface SecHostCoverageMatrixSummaryTotals {
  rows: number
  hostnames: number
  covered: number
  notCovered: number
}

export interface SecHostCoverageMatrixBreakdownItem {
  value: string
  count: number
}

export interface SecHostCoverageMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  metricColumns: string[]
  totals: SecHostCoverageMatrixSummaryTotals
  breakdowns: Record<string, SecHostCoverageMatrixBreakdownItem[]>
  metricTotals: Record<string, number>
}

export type SecHostCoverageMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: SecHostCoverageMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface SecHostCoverageMatrixScoreCardEntry {
  hostname: string
  status: string
}

export interface SecHostCoverageMatrixScoreCardGroup {
  configName: string
  count: number
  attackGroupAlert: SecHostCoverageMatrixScoreCardEntry[]
  attackGroupDeny: SecHostCoverageMatrixScoreCardEntry[]
}

export interface SecHostCoverageMatrixScoreCardTotals {
  hostnames: number
  configNames: number
}

export interface SecHostCoverageMatrixScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  secHostCoverageMatrix: SecHostCoverageMatrixScoreCardGroup[]
  totals: SecHostCoverageMatrixScoreCardTotals
}

export interface TrafficMatrixTotals {
  rows: number
  hostnames: number
}

export interface TrafficMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  metricColumns: string[]
  hostnames: string[]
  rows: Array<Record<string, string>>
  totals: TrafficMatrixTotals
}

export type TrafficMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: TrafficMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface TrafficMatrixSummaryTotals {
  hostnames: number
  edgeHits: number
  originHits: number
  edgeBytes: number
  originBytes: number
  hitsOffload: number
  bytesOffload: number
}

export interface TrafficMatrixBreakdownItem {
  value: string
  count: number
}

export interface TrafficMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  metricColumns: string[]
  totals: TrafficMatrixSummaryTotals
  breakdowns: Record<string, TrafficMatrixBreakdownItem[]>
}

export type TrafficMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: TrafficMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface TrafficMatrixScoreCardHostnameEntry {
  hostname: string
  edgeHits: number
  originHits: number
  edgeBytes: number
  originBytes: number
  hitsOffload: number
  bytesOffload: number
}

export interface TrafficMatrixScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  totals: TrafficMatrixSummaryTotals
  hostnames: TrafficMatrixScoreCardHostnameEntry[]
}

export type CoreWebVitalRating = 'good' | 'needs-improvement' | 'poor' | null

export interface PerfMatrixHistoryPoint {
  period: string
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
}

export interface PerfMatrixTotals {
  hostnames: number
  processed: number
  available: number
  unavailable: number
}

export interface PerfMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  metricColumns: string[]
  hostnames: string[]
  rows: Array<Record<string, string>>
  series: Record<string, PerfMatrixHistoryPoint[]>
  totals: PerfMatrixTotals
}

export type PerfMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: PerfMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface PerfMatrixSummaryTotals {
  hostnames: number
  processed: number
  available: number
  unavailable: number
  lcpMsAvg: number | null
  inpMsAvg: number | null
  clsAvg: number | null
}

export interface PerfMatrixBreakdownItem {
  value: string
  count: number
}

export interface PerfMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  totals: PerfMatrixSummaryTotals
  breakdowns: Record<string, PerfMatrixBreakdownItem[]>
  series: Record<string, PerfMatrixHistoryPoint[]>
}

export type PerfMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: PerfMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface PerfMatrixCoreWebVitals {
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
  lcpRating: CoreWebVitalRating
  inpRating: CoreWebVitalRating
  clsRating: CoreWebVitalRating
  source: 'crux' | 'pagespeed' | null
}

export interface PerfMatrixScoreCardHostnameEntry {
  hostname: string
  corewebvitals: PerfMatrixCoreWebVitals
}

export interface PerfMatrixScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  totals: {
    hostnames: number
    corewebvitals: {
      lcpMsAvg: number | null
      inpMsAvg: number | null
      clsAvg: number | null
    }
  }
  hostnames: PerfMatrixScoreCardHostnameEntry[]
}

export interface PerfMatrixTopNTotals {
  hostnames: number
  topN: number
  available: number
  unavailable: number
}

export interface PerfMatrixTopNResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  metricColumns: string[]
  hostnames: string[]
  rows: Array<Record<string, string>>
  series: Record<string, PerfMatrixHistoryPoint[]>
  totals: PerfMatrixTopNTotals
}

export type PerfMatrixTopNJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: PerfMatrixTopNResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface PerfMatrixTopNSummaryTotals {
  hostnames: number
  topN: number
  available: number
  unavailable: number
  lcpMsAvg: number | null
  inpMsAvg: number | null
  clsAvg: number | null
}

export interface PerfMatrixTopNSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  totals: PerfMatrixTopNSummaryTotals
  breakdowns: Record<string, PerfMatrixBreakdownItem[]>
  series: Record<string, PerfMatrixHistoryPoint[]>
}

export type PerfMatrixTopNSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: PerfMatrixTopNSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface PerfMatrixTopNScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  totals: {
    hostnames: number
    corewebvitals: {
      lcpMsAvg: number | null
      inpMsAvg: number | null
      clsAvg: number | null
    }
  }
  hostnames: PerfMatrixScoreCardHostnameEntry[]
}

// --- wsaAlertMatrix ---

export interface WsaAlertMatrixTotals {
  rows: number
  configs: number
  features: number
}

export interface WsaAlertMatrixResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  featureColumns: string[]
  configs: string[]
  rows: Array<Record<string, string>>
  totals: WsaAlertMatrixTotals
}

export type WsaAlertMatrixJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: WsaAlertMatrixResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface WsaAlertMatrixSummaryTotals {
  rows: number
  configs: number
  features: number
  enabled: number
  disabled: number
}

export interface WsaAlertMatrixBreakdownItem {
  value: string
  count: number
}

export interface WsaAlertMatrixSummaryResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  columns: string[]
  baseColumns: string[]
  featureColumns: string[]
  totals: WsaAlertMatrixSummaryTotals
  breakdowns: Record<string, WsaAlertMatrixBreakdownItem[]>
}

export type WsaAlertMatrixSummaryJobProgressEvent =
  | { type: 'progress'; message: string; level: JobProgressLevel; percent: number; timestamp: number }
  | { type: 'completed'; percent: number; result: WsaAlertMatrixSummaryResult; timestamp: number }
  | { type: 'failed'; message: string; timestamp: number }

export interface WsaAlertMatrixScoreCardEntry {
  configName: string
  status: string
}

export interface WsaAlertMatrixScoreCardFeature {
  featureName: string
  count: number
  configs: WsaAlertMatrixScoreCardEntry[]
}

export interface WsaAlertMatrixScoreCardResult {
  accountKey: string
  accountName: string
  accountId: string
  dataMode: CsvDataMode
  wsaAlertMatrix: WsaAlertMatrixScoreCardFeature[]
  totals: { configs: number; features: number }
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
