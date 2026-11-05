import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { AccountingPage } from './pages/Accounting'
import { AdminPage } from './pages/Admin'
import { ArmoryPage } from './pages/Armory'
import { AuditPage } from './pages/Audit'
import { CitizensPage } from './pages/Citizens'
import { DashboardPage } from './pages/Dashboard'
import { EmployeesPage } from './pages/Employees'
import { FinesPage } from './pages/Fines'
import { LawsPage } from './pages/Laws'
import { LossesPage } from './pages/Losses'
import { RequestsPage } from './pages/Requests'
import { SeizuresPage } from './pages/Seizures'
import { WantedPage } from './pages/Wanted'
import { Login, Shell } from './shell'

export function App() {
  const auth = useAuth()
  if (auth.loading) return <div className="boot">Открываем архив департамента…</div>
  if (!auth.user) return <Login />
  return (
    <Shell>
      <Pages />
    </Shell>
  )
}

function Pages() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-enter">
      <Routes location={location}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/citizens" element={<CitizensPage />} />
        <Route path="/armory" element={<ArmoryPage />} />
        <Route path="/losses" element={<LossesPage />} />
        <Route path="/seizures" element={<SeizuresPage />} />
        <Route path="/laws" element={<LawsPage />} />
        <Route path="/wanted" element={<WantedPage />} />
        <Route path="/fines" element={<FinesPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
