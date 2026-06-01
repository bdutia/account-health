import { accountDetails, accounts, summaryMetrics, summaryPanels } from '../data/mockData'
import type {
  AccountDetail,
  AccountSummaryRow,
  DetailPillar,
  HealthTone,
  PanelItem,
  SummaryDashboardData,
  SummaryMetric,
  SummaryPanel,
} from '../types/dashboard'

type GoogleSheetValues = {
  values?: string[][]
}

type BackendResponse<T> = {
  source: 'mock' | 'google'
  data: T
}

const DATA_MODE = (import.meta.env.VITE_DASHBOARD_DATA_MODE ?? 'mock').toLowerCase()
const DEFAULT_API_BASE_URL = `${import.meta.env.BASE_URL}api`.replace(/\/$/, '')
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL

const GOOGLE_CONFIG = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  spreadsheetId: import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID,
  summaryMetricsRange: import.meta.env.VITE_GOOGLE_SHEETS_SUMMARY_METRICS_RANGE ?? 'SummaryMetrics!A:E',
  accountsRange: import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNTS_RANGE ?? 'Accounts!A:I',
  summaryPanelsRange: import.meta.env.VITE_GOOGLE_SHEETS_SUMMARY_PANELS_RANGE ?? 'SummaryPanels!A:F',
  accountDetailsRange: import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNT_DETAILS_RANGE ?? 'AccountDetails!A:D',
  accountHeroMetricsRange:
    import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNT_HERO_METRICS_RANGE ?? 'AccountHeroMetrics!A:F',
  accountHighlightsRange: import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNT_HIGHLIGHTS_RANGE ?? 'AccountHighlights!A:F',
  accountActionsRange: import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNT_ACTIONS_RANGE ?? 'AccountActions!A:F',
  accountPillarsRange: import.meta.env.VITE_GOOGLE_SHEETS_ACCOUNT_PILLARS_RANGE ?? 'AccountPillars!A:H',
}

function isGoogleConfigured() {
  return Boolean(GOOGLE_CONFIG.apiKey && GOOGLE_CONFIG.spreadsheetId)
}

function toTone(input: string): HealthTone {
  const value = input.trim().toLowerCase()
  if (value === 'healthy' || value === 'watch' || value === 'risk' || value === 'neutral') {
    return value
  }
  return 'neutral'
}

function toMap(values: string[][]): Array<Record<string, string>> {
  if (values.length === 0) {
    return []
  }

  const [headers, ...rows] = values
  return rows
    .filter((row) => row.some((cell) => cell?.trim()))
    .map((row) =>
      headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header.trim()] = row[index]?.trim() ?? ''
        return acc
      }, {}),
    )
}

async function fetchSheetRange(range: string): Promise<string[][]> {
  if (!isGoogleConfigured()) {
    return []
  }

  const apiKey = GOOGLE_CONFIG.apiKey
  if (!apiKey) {
    return []
  }

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_CONFIG.spreadsheetId}/values/${encodeURIComponent(range)}`,
  )
  url.searchParams.set('key', apiKey)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Failed to load sheet range ${range}: ${response.status}`)
  }

  const payload = (await response.json()) as GoogleSheetValues
  return payload.values ?? []
}

async function fetchGoogleDocText(docId: string): Promise<string | null> {
  if (!isGoogleConfigured() || !docId) {
    return null
  }

  const apiKey = GOOGLE_CONFIG.apiKey
  if (!apiKey) {
    return null
  }

  const url = new URL(`https://docs.googleapis.com/v1/documents/${docId}`)
  url.searchParams.set('key', apiKey)

  const response = await fetch(url.toString())
  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: {
              content?: string
            }
          }>
        }
      }>
    }
  }

  const content = payload.body?.content ?? []
  const text = content
    .flatMap((block) => block.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return text || null
}

function toSummaryMetrics(values: string[][]): SummaryMetric[] {
  return toMap(values).map((row, index) => ({
    id: row.id || `metric-${index + 1}`,
    title: row.title,
    value: row.value,
    subtitle: row.subtitle,
    tone: toTone(row.tone),
  }))
}

function toAccounts(values: string[][]): AccountSummaryRow[] {
  return toMap(values).map((row, index) => ({
    accountId: row.accountId || `account-${index + 1}`,
    name: row.name,
    healthScore: {
      value: Number.parseInt(row.healthScore, 10) || 0,
      tone: toTone(row.healthTone),
    },
    renewalRisk: row.renewalRisk,
    expansionPotential: row.expansionPotential,
    technicalMaturity: row.technicalMaturity,
    deliveryHealth: row.deliveryHealth,
    execAttention: row.execAttention,
  }))
}

function toSummaryPanels(values: string[][]): SummaryPanel[] {
  const grouped = new Map<string, SummaryPanel>()

  toMap(values).forEach((row, index) => {
    const panelId = row.panelId || `panel-${index + 1}`
    const existing = grouped.get(panelId)
    const item: PanelItem = {
      id: row.itemId || `${panelId}-item-${index + 1}`,
      label: row.label,
      value: row.value,
      tone: toTone(row.tone),
    }

    if (existing) {
      existing.items.push(item)
      return
    }

    grouped.set(panelId, {
      id: panelId,
      title: row.panelTitle,
      items: [item],
    })
  })

  return Array.from(grouped.values())
}

function toDetailPillars(values: string[][], accountId: string): DetailPillar[] {
  const grouped = new Map<string, DetailPillar>()

  toMap(values)
    .filter((row) => row.accountId === accountId)
    .forEach((row, index) => {
      const pillarId = row.pillarId || `pillar-${index + 1}`
      const item: PanelItem = {
        id: row.itemId || `${pillarId}-item-${index + 1}`,
        label: row.label,
        value: row.value,
        tone: toTone(row.tone),
      }
      const existing = grouped.get(pillarId)

      if (existing) {
        existing.items.push(item)
        return
      }

      grouped.set(pillarId, {
        id: pillarId,
        title: row.pillarTitle,
        items: [item],
      })
    })

  return Array.from(grouped.values())
}

async function enrichItemFromGoogleDoc(item: PanelItem, docId: string): Promise<PanelItem> {
  if (!docId) {
    return item
  }

  const docText = await fetchGoogleDocText(docId)
  if (!docText) {
    return item
  }

  return {
    ...item,
    value: docText,
  }
}

async function toItemsWithOptionalDocs(
  values: string[][],
  accountId: string,
): Promise<PanelItem[]> {
  const rows = toMap(values).filter((row) => row.accountId === accountId)

  const items = rows.map((row, index) => ({
    item: {
      id: row.itemId || `${accountId}-item-${index + 1}`,
      label: row.label,
      value: row.value,
      tone: toTone(row.tone),
    },
    docId: row.docId,
  }))

  return Promise.all(items.map(({ item, docId }) => enrichItemFromGoogleDoc(item, docId)))
}

async function fetchSummaryFromGoogle(): Promise<SummaryDashboardData> {
  const [metricsValues, accountValues, panelValues] = await Promise.all([
    fetchSheetRange(GOOGLE_CONFIG.summaryMetricsRange),
    fetchSheetRange(GOOGLE_CONFIG.accountsRange),
    fetchSheetRange(GOOGLE_CONFIG.summaryPanelsRange),
  ])

  return {
    summaryMetrics: toSummaryMetrics(metricsValues),
    accounts: toAccounts(accountValues),
    summaryPanels: toSummaryPanels(panelValues),
  }
}

async function fetchSummaryFromBackend(): Promise<SummaryDashboardData> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`)
  if (!response.ok) {
    throw new Error(`Backend summary request failed: ${response.status}`)
  }

  const payload = (await response.json()) as BackendResponse<SummaryDashboardData>
  return payload.data
}

async function fetchDetailFromGoogle(accountId: string): Promise<AccountDetail | undefined> {
  const [detailsValues, heroMetricsValues, highlightValues, actionValues, pillarValues] = await Promise.all([
    fetchSheetRange(GOOGLE_CONFIG.accountDetailsRange),
    fetchSheetRange(GOOGLE_CONFIG.accountHeroMetricsRange),
    fetchSheetRange(GOOGLE_CONFIG.accountHighlightsRange),
    fetchSheetRange(GOOGLE_CONFIG.accountActionsRange),
    fetchSheetRange(GOOGLE_CONFIG.accountPillarsRange),
  ])

  const detailRow = toMap(detailsValues).find((row) => row.accountId === accountId)
  if (!detailRow) {
    return undefined
  }

  const heroMetrics = toMap(heroMetricsValues)
    .filter((row) => row.accountId === accountId)
    .map((row, index) => ({
      id: row.id || `${accountId}-hero-${index + 1}`,
      title: row.title,
      value: row.value,
      subtitle: row.subtitle,
      tone: toTone(row.tone),
    }))

  const [highlights, actions] = await Promise.all([
    toItemsWithOptionalDocs(highlightValues, accountId),
    toItemsWithOptionalDocs(actionValues, accountId),
  ])

  return {
    accountId,
    name: detailRow.name,
    owner: detailRow.owner,
    quarter: detailRow.quarter,
    heroMetrics,
    highlights,
    actions,
    pillars: toDetailPillars(pillarValues, accountId),
  }
}

async function fetchDetailFromBackend(accountId: string): Promise<AccountDetail | undefined> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard/account/${accountId}`)
  if (response.status === 404) {
    return undefined
  }
  if (!response.ok) {
    throw new Error(`Backend account request failed: ${response.status}`)
  }

  const payload = (await response.json()) as BackendResponse<AccountDetail | undefined>
  return payload.data
}

export async function fetchSummaryDashboardData(): Promise<SummaryDashboardData> {
  if (DATA_MODE === 'backend') {
    try {
      return await fetchSummaryFromBackend()
    } catch {
      return {
        summaryMetrics,
        accounts,
        summaryPanels,
      }
    }
  }

  if (DATA_MODE !== 'google' || !isGoogleConfigured()) {
    return {
      summaryMetrics,
      accounts,
      summaryPanels,
    }
  }

  try {
    const data = await fetchSummaryFromGoogle()
    if (!data.summaryMetrics.length || !data.accounts.length || !data.summaryPanels.length) {
      throw new Error('Google dataset is incomplete')
    }
    return data
  } catch {
    return {
      summaryMetrics,
      accounts,
      summaryPanels,
    }
  }
}

export async function fetchAccountDashboardData(accountId: string): Promise<AccountDetail | undefined> {
  if (DATA_MODE === 'backend') {
    try {
      return await fetchDetailFromBackend(accountId)
    } catch {
      return accountDetails[accountId]
    }
  }

  if (DATA_MODE !== 'google' || !isGoogleConfigured()) {
    return accountDetails[accountId]
  }

  try {
    return (await fetchDetailFromGoogle(accountId)) ?? accountDetails[accountId]
  } catch {
    return accountDetails[accountId]
  }
}
