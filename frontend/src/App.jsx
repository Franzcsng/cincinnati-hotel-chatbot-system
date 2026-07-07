import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import ClientPage from './pages/client/ClientPage.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import DashboardPage from './pages/admin/DashboardPage.jsx'
import UploadPdfPage from './pages/admin/UploadPdfPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/client" element={<ClientPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="upload" element={<UploadPdfPage />} />
      </Route>
    </Routes>
  )
}

export default App
