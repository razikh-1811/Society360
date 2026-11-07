import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HOME, useAuth } from '../context/AuthContext';
import { PageLoader } from './ui';

// Requires a signed-in user, and (optionally) one of the allowed roles.
export default function ProtectedRoute({ roles }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
