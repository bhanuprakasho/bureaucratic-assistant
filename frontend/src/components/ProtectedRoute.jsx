import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

const ProtectedRoute = ({ children, roles = [] }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center' }}>
        <Loader className="spin" size={32} color="var(--primary)" />
        <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Verifying credentials...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles.length > 0 && (!user || !roles.includes(user.role))) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center', borderColor: 'var(--danger)' }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Access Denied</h2>
        <p style={{ color: '#475569', marginBottom: '1.5rem' }}>
          This page requires one of the following roles: <strong>{roles.join(', ')}</strong>.
          Your current account role is: <strong>{user?.role || 'None'}</strong>.
        </p>
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Go Back
        </button>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
