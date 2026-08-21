import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountDetailPage } from './pages/AccountDetailPage'
import { FeatureMatrixPage } from './pages/FeatureMatrixPage'
import { FeatureMatrixScoreCardPage } from './pages/FeatureMatrixScoreCardPage'
import { FeatureMatrixSummaryPage } from './pages/FeatureMatrixSummaryPage'
import { HostMatrixCnamePage } from './pages/HostMatrixCnamePage'
import { HostMatrixCnameSummaryPage } from './pages/HostMatrixCnameSummaryPage'
import { HostnameCnameCoveragePage } from './pages/HostnameCnameCoveragePage'
import { PerfMatrixPage } from './pages/PerfMatrixPage'
import { PerfMatrixScoreCardPage } from './pages/PerfMatrixScoreCardPage'
import { PerfMatrixSummaryPage } from './pages/PerfMatrixSummaryPage'
import { PerfMatrixTopNPage } from './pages/PerfMatrixTopNPage'
import { PerfMatrixTopNScoreCardPage } from './pages/PerfMatrixTopNScoreCardPage'
import { PerfMatrixTopNSummaryPage } from './pages/PerfMatrixTopNSummaryPage'
import { SecHostCoverageMatrixPage } from './pages/SecHostCoverageMatrixPage'
import { SecHostCoverageMatrixScoreCardPage } from './pages/SecHostCoverageMatrixScoreCardPage'
import { SecHostCoverageMatrixSummaryPage } from './pages/SecHostCoverageMatrixSummaryPage'
import { SummaryPage } from './pages/SummaryPage'
import { TrafficMatrixPage } from './pages/TrafficMatrixPage'
import { TrafficMatrixScoreCardPage } from './pages/TrafficMatrixScoreCardPage'
import { TrafficMatrixSummaryPage } from './pages/TrafficMatrixSummaryPage'
import { WsaAlertMatrixPage } from './pages/WsaAlertMatrixPage'
import { WsaAlertMatrixScoreCardPage } from './pages/WsaAlertMatrixScoreCardPage'
import { WsaAlertMatrixSummaryPage } from './pages/WsaAlertMatrixSummaryPage'

const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Routes>
        <Route path="/" element={<SummaryPage />} />
        <Route path="/account/:accountId" element={<AccountDetailPage />} />
        <Route path="/account/:accountId/hostname-cname-coverage" element={<HostnameCnameCoveragePage />} />
        <Route path="/account/:accountId/hostmatrix/cname" element={<HostMatrixCnamePage />} />
        <Route path="/account/:accountId/hostmatrix/cname/summary" element={<HostMatrixCnameSummaryPage />} />
        <Route path="/account/:accountId/hostmatrix-cname" element={<HostMatrixCnamePage />} />
        <Route path="/account/:accountId/featureMatrix/summary" element={<FeatureMatrixSummaryPage />} />
        <Route path="/account/:accountId/featureMatrix/scoreCard" element={<FeatureMatrixScoreCardPage />} />
        <Route path="/account/:accountId/featureMatrix/:propIdOrFeature" element={<FeatureMatrixPage />} />
        <Route path="/account/:accountId/featureMatrix" element={<FeatureMatrixPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/summary" element={<SecHostCoverageMatrixSummaryPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/scoreCard" element={<SecHostCoverageMatrixScoreCardPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/:configOrFeature" element={<SecHostCoverageMatrixPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix" element={<SecHostCoverageMatrixPage />} />
        <Route path="/account/:accountId/trafficMatrix/summary" element={<TrafficMatrixSummaryPage />} />
        <Route path="/account/:accountId/trafficMatrix/scoreCard" element={<TrafficMatrixScoreCardPage />} />
        <Route path="/account/:accountId/trafficMatrix/:hostname" element={<TrafficMatrixPage />} />
        <Route path="/account/:accountId/trafficMatrix" element={<TrafficMatrixPage />} />
        <Route path="/account/:accountId/perfMatrix/summary" element={<PerfMatrixSummaryPage />} />
        <Route path="/account/:accountId/perfMatrix/scoreCard" element={<PerfMatrixScoreCardPage />} />
        <Route path="/account/:accountId/perfMatrix/:hostname" element={<PerfMatrixPage />} />
        <Route path="/account/:accountId/perfMatrix" element={<PerfMatrixPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/summary" element={<PerfMatrixTopNSummaryPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/scoreCard" element={<PerfMatrixTopNScoreCardPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/:hostname" element={<PerfMatrixTopNPage />} />
        <Route path="/account/:accountId/perfMatrixTopN" element={<PerfMatrixTopNPage />} />
        <Route path="/account/:accountId/wsaAlertMatrix/summary" element={<WsaAlertMatrixSummaryPage />} />
        <Route path="/account/:accountId/wsaAlertMatrix/scoreCard" element={<WsaAlertMatrixScoreCardPage />} />
        <Route path="/account/:accountId/wsaAlertMatrix/:configOrFeature" element={<WsaAlertMatrixPage />} />
        <Route path="/account/:accountId/wsaAlertMatrix" element={<WsaAlertMatrixPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <Routes>
        <Route path="/" element={<SummaryPage />} />
        <Route path="/account/:accountId" element={<AccountDetailPage />} />
        <Route path="/account/:accountId/hostname-cname-coverage" element={<HostnameCnameCoveragePage />} />
        <Route path="/account/:accountId/hostmatrix/cname" element={<HostMatrixCnamePage />} />
        <Route path="/account/:accountId/hostmatrix/cname/summary" element={<HostMatrixCnameSummaryPage />} />
        <Route path="/account/:accountId/hostmatrix-cname" element={<HostMatrixCnamePage />} />
        <Route path="/account/:accountId/featureMatrix/summary" element={<FeatureMatrixSummaryPage />} />
        <Route path="/account/:accountId/featureMatrix/scoreCard" element={<FeatureMatrixScoreCardPage />} />
        <Route path="/account/:accountId/featureMatrix/:propIdOrFeature" element={<FeatureMatrixPage />} />
        <Route path="/account/:accountId/featureMatrix" element={<FeatureMatrixPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/summary" element={<SecHostCoverageMatrixSummaryPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/scoreCard" element={<SecHostCoverageMatrixScoreCardPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix/:configOrFeature" element={<SecHostCoverageMatrixPage />} />
        <Route path="/account/:accountId/secHostCoverageMatrix" element={<SecHostCoverageMatrixPage />} />
        <Route path="/account/:accountId/trafficMatrix/summary" element={<TrafficMatrixSummaryPage />} />
        <Route path="/account/:accountId/trafficMatrix/scoreCard" element={<TrafficMatrixScoreCardPage />} />
        <Route path="/account/:accountId/trafficMatrix/:hostname" element={<TrafficMatrixPage />} />
        <Route path="/account/:accountId/trafficMatrix" element={<TrafficMatrixPage />} />
        <Route path="/account/:accountId/perfMatrix/summary" element={<PerfMatrixSummaryPage />} />
        <Route path="/account/:accountId/perfMatrix/scoreCard" element={<PerfMatrixScoreCardPage />} />
        <Route path="/account/:accountId/perfMatrix/:hostname" element={<PerfMatrixPage />} />
        <Route path="/account/:accountId/perfMatrix" element={<PerfMatrixPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/summary" element={<PerfMatrixTopNSummaryPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/scoreCard" element={<PerfMatrixTopNScoreCardPage />} />
        <Route path="/account/:accountId/perfMatrixTopN/:hostname" element={<PerfMatrixTopNPage />} />
        <Route path="/account/:accountId/perfMatrixTopN" element={<PerfMatrixTopNPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
