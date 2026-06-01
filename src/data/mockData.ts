import type {
  AccountDetail,
  AccountSummaryRow,
  SummaryMetric,
  SummaryPanel,
} from '../types/dashboard'

export const summaryMetrics: SummaryMetric[] = [
  {
    id: 'health-score',
    title: 'Health Score Avg',
    value: '76',
    subtitle: 'Watch',
    tone: 'watch',
  },
  {
    id: 'renewal-risk',
    title: 'Renewal Risk',
    value: '12',
    subtitle: 'Accounts At Risk',
    tone: 'risk',
  },
  {
    id: 'expansion',
    title: 'Expansion Potential',
    value: '8',
    subtitle: 'Growth Opportunities',
    tone: 'healthy',
  },
  {
    id: 'maturity',
    title: 'Technical Maturity',
    value: 'Intermediate',
    subtitle: 'Current Level',
    tone: 'neutral',
  },
  {
    id: 'delivery',
    title: 'Delivery Health',
    value: '82%',
    subtitle: 'On Track',
    tone: 'healthy',
  },
  {
    id: 'exec',
    title: 'Exec Attention Needed',
    value: '5',
    subtitle: 'High Priority Accounts',
    tone: 'watch',
  },
]

export const accounts: AccountSummaryRow[] = [
  {
    accountId: 'acme-corp',
    name: 'Acme Corp',
    healthScore: { value: 78, tone: 'watch' },
    renewalRisk: 'High Risk',
    expansionPotential: 'Expansion Pipeline',
    technicalMaturity: 'Intermediate',
    deliveryHealth: 'On Track',
    execAttention: 'Exec Review',
  },
  {
    accountId: 'beta-industries',
    name: 'Beta Industries',
    healthScore: { value: 62, tone: 'risk' },
    renewalRisk: 'At Risk',
    expansionPotential: 'Limited',
    technicalMaturity: 'Foundational',
    deliveryHealth: 'At Risk',
    execAttention: 'Upsell Opportunity',
  },
  {
    accountId: 'gamma-solutions',
    name: 'Gamma Solutions',
    healthScore: { value: 85, tone: 'healthy' },
    renewalRisk: 'Healthy',
    expansionPotential: 'Growth Potential',
    technicalMaturity: 'Advanced',
    deliveryHealth: 'On Track',
    execAttention: '-',
  },
  {
    accountId: 'delta-enterprises',
    name: 'Delta Enterprises',
    healthScore: { value: 54, tone: 'risk' },
    renewalRisk: 'At Risk',
    expansionPotential: 'Whitespace',
    technicalMaturity: 'Intermediate',
    deliveryHealth: 'Off Track',
    execAttention: 'Escalation Needed',
  },
  {
    accountId: 'epsilon-tech',
    name: 'Epsilon Tech',
    healthScore: { value: 80, tone: 'watch' },
    renewalRisk: 'Healthy',
    expansionPotential: 'Expansion Potential',
    technicalMaturity: 'Optimized',
    deliveryHealth: 'On Track',
    execAttention: 'Strategic Push',
  },
]

export const summaryPanels: SummaryPanel[] = [
  {
    id: 'renewals',
    title: 'Renewals & Expansion',
    items: [
      { id: 'r1', label: 'Upcoming Renewals', value: '5 in next 60 days', tone: 'watch' },
      { id: 'r2', label: 'Expansion Pipeline', value: '$1.2M potential upsell', tone: 'healthy' },
      { id: 'r3', label: 'Whitespace Analysis', value: '42% untapped potential', tone: 'neutral' },
    ],
  },
  {
    id: 'delivery',
    title: 'Technical & Delivery Health',
    items: [
      { id: 'd1', label: 'Feature Adoption', value: '68% feature utilization', tone: 'watch' },
      { id: 'd2', label: 'Open Support Issues', value: '7 active tickets', tone: 'risk' },
      { id: 'd3', label: 'Project Status', value: '2 delays in implementation', tone: 'watch' },
    ],
  },
  {
    id: 'opps',
    title: 'Key Opportunities & Risks',
    items: [
      { id: 'o1', label: 'Growth Opportunity', value: 'Target security upgrade', tone: 'healthy' },
      { id: 'o2', label: 'At Risk Alert', value: 'Renewal at risk for Beta Industries', tone: 'risk' },
      { id: 'o3', label: 'Action Needed', value: 'Schedule executive review', tone: 'watch' },
    ],
  },
]

const acmeDetail: AccountDetail = {
  accountId: 'acme-corp',
  name: 'Acme Corp',
  owner: 'John Doe',
  quarter: 'Q1 2024',
  heroMetrics: [
    { id: 'd-health', title: 'Health Score Avg', value: '78', subtitle: 'Watch', tone: 'watch' },
    { id: 'd-renew', title: 'Renewal Risk', value: '58', subtitle: '$850K ARR at risk', tone: 'risk' },
    { id: 'd-adopt', title: 'Product Adoption', value: '73', subtitle: 'Watch', tone: 'watch' },
    { id: 'd-delivery', title: 'Delivery Health', value: '85', subtitle: 'Healthy', tone: 'healthy' },
    {
      id: 'd-expansion',
      title: 'Expansion Opportunity',
      value: '$450K',
      subtitle: 'Growth potential',
      tone: 'healthy',
    },
    { id: 'd-relationship', title: 'Relationship Health', value: '84', subtitle: 'Watch', tone: 'watch' },
  ],
  highlights: [
    { id: 'h1', label: 'Support', value: '6 open support tickets need urgent attention', tone: 'risk' },
    { id: 'h2', label: 'Adoption', value: 'Limited Bot Manager adoption despite license', tone: 'watch' },
    { id: 'h3', label: 'Renewal', value: 'Renewal approaching with $850K at risk', tone: 'risk' },
  ],
  actions: [
    {
      id: 'a1',
      label: 'Enablement',
      value: 'Enable Bot Manager features to improve API and security coverage',
      tone: 'healthy',
    },
    {
      id: 'a2',
      label: 'Executive Review',
      value: 'Schedule executive review before renewal to plan next steps',
      tone: 'watch',
    },
    {
      id: 'a3',
      label: 'Upsell',
      value: 'Propose security upsell in QBR due to whitespace area',
      tone: 'healthy',
    },
  ],
  pillars: [
    {
      id: 'p1',
      title: 'Renewal Risk',
      items: [
        { id: 'p1-1', label: 'ARR', value: '$850,000', tone: 'risk' },
        { id: 'p1-2', label: 'Renewal Probability', value: '60%', tone: 'watch' },
        { id: 'p1-3', label: 'Renewal Date', value: 'Jun 15, 2024', tone: 'neutral' },
      ],
    },
    {
      id: 'p2',
      title: 'Product Adoption',
      items: [
        { id: 'p2-1', label: 'Utilization', value: '78% healthy', tone: 'healthy' },
        { id: 'p2-2', label: 'Bot Manager', value: 'Limited deployment', tone: 'watch' },
        { id: 'p2-3', label: 'Advanced Features', value: 'Not widely used', tone: 'risk' },
      ],
    },
    {
      id: 'p3',
      title: 'Delivery Health',
      items: [
        { id: 'p3-1', label: 'Utilization', value: '78% utilization', tone: 'healthy' },
        { id: 'p3-2', label: 'Escalations', value: 'No open escalations', tone: 'healthy' },
        { id: 'p3-3', label: 'Project Status', value: '1 active project on track', tone: 'healthy' },
      ],
    },
    {
      id: 'p4',
      title: 'Expansion Opportunity',
      items: [
        { id: 'p4-1', label: 'Pipeline', value: '$450K potential', tone: 'healthy' },
        { id: 'p4-2', label: 'Security Upgrade', value: 'Proposed in current quarter', tone: 'healthy' },
        { id: 'p4-3', label: 'Whitespace', value: '2 areas identified', tone: 'watch' },
      ],
    },
    {
      id: 'p5',
      title: 'Relationship Health',
      items: [
        { id: 'p5-1', label: 'Exec Engagement', value: 'Quarterly', tone: 'watch' },
        { id: 'p5-2', label: 'QBR', value: 'Scheduled for next month', tone: 'healthy' },
        { id: 'p5-3', label: 'Satisfaction', value: '7.6 / 10', tone: 'watch' },
      ],
    },
  ],
}

export const accountDetails: Record<string, AccountDetail> = {
  'acme-corp': acmeDetail,
}
