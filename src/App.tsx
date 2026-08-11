import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountDetailPage } from './pages/AccountDetailPage'
import { FeatureMatrixPage } from './pages/FeatureMatrixPage'
import { FeatureMatrixScoreCardPage } from './pages/FeatureMatrixScoreCardPage'
import { FeatureMatrixSummaryPage } from './pages/FeatureMatrixSummaryPage'
import { HostMatrixCnamePage } from './pages/HostMatrixCnamePage'
import { HostMatrixCnameSummaryPage } from './pages/HostMatrixCnameSummaryPage'
import { HostnameCnameCoveragePage } from './pages/HostnameCnameCoveragePage'
import { SummaryPage } from './pages/SummaryPage'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
