import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountDetailPage } from './pages/AccountDetailPage'
import { HostMatrixCnamePage } from './pages/HostMatrixCnamePage'
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
        <Route path="/account/:accountId/hostmatrix-cname" element={<HostMatrixCnamePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
