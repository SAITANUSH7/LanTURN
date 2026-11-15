import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import DeepamLoader from '../components/ui/DeepamLoader.jsx';

export function RequireAuth({ children }) {
  const { firebaseUser, loading } = useAuth();
  if (loading) {
    return <DeepamLoader size="lg" delay={800} />;
  }
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return children || <Outlet />;
}

export function RequireOnboarded({ children }) {
  const { firebaseUser, isOnboarded, loading } = useAuth();
  if (loading) {
    return <DeepamLoader size="lg" delay={800} />;
  }
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!isOnboarded) return <Navigate to="/onboarding" replace />;
  return children || <Outlet />;
}

export function RequireRole({ roles, children }) {
  const { role, loading, firebaseUser } = useAuth();
  if (loading || (firebaseUser && role === null)) {
    return <DeepamLoader size="lg" delay={800} />;
  }
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) return <Navigate to="/login" replace />;
  return children || <Outlet />;
}