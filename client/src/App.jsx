import { Navigate, Route, Routes } from 'react-router-dom';
import { HOME, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import ResidentDashboard from './pages/ResidentDashboard';
import Billing from './pages/Billing';
import Complaints from './pages/Complaints';
import Reconciliation from './pages/Reconciliation';
import HelpDesk from './pages/HelpDesk';
import Committee from './pages/Committee';
import { EmptyState } from './components/ui';

const Home = () => { const { user } = useAuth(); return <Navigate to={user ? HOME[user.role] : '/login'} replace />; };

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<ProtectedRoute roles={['resident']} />}>
            <Route path="/resident" element={<ResidentDashboard />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/complaints" element={<Complaints />} />
          </Route>
          <Route element={<ProtectedRoute roles={['helpdesk']} />}>
            <Route path="/helpdesk" element={<HelpDesk />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
          </Route>
          <Route element={<ProtectedRoute roles={['committee']} />}>
            <Route path="/committee" element={<Committee />} />
          </Route>
          <Route element={<ProtectedRoute roles={['helpdesk', 'committee']} />}>
            <Route path="/ledgers" element={<Billing staff />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<EmptyState title="Page not found" text="That page does not exist." />} />
    </Routes>
  );
}
