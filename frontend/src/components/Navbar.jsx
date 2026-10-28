import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, BookOpen, Upload, CheckCircle, ListChecks, ShieldAlert, FileText, Bell, FileEdit, UserCheck, LogIn, LogOut, User, MessageCircle } from 'lucide-react';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <ShieldCheck size={28} />
          <div>
            <div className="brand-title">Bureaucratic Assistance & Verification System</div>
            <div className="brand-subtitle">Autonomous Citizen Portal, ML Scam Screener & Immigration Reviewer</div>
          </div>
        </Link>

        {/* User Account State & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{user.full_name}</div>
                <span className={`badge ${user.role === 'admin' ? 'badge-danger' : (user.role === 'reviewer' ? 'badge-info' : 'badge-success')}`} style={{ fontSize: '0.675rem' }}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                title="Sign Out"
              >
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <LogIn size={14} /> Sign In
            </Link>
          )}
        </div>

        {/* Primary Navigation Links */}
        <nav className="nav-links" style={{ width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem', marginTop: '0.25rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
            Dashboard
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Services
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            OCR Vault
          </NavLink>
          <NavLink to="/eligibility" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Eligibility
          </NavLink>
          <NavLink   to="/rag-assistant"   className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            RAG Chat Assistant
          </NavLink>
          <NavLink to="/checklist" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Checklist
          </NavLink>
          <NavLink to="/scam-verify" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Scam Verify
          </NavLink>
          <NavLink to="/immigration" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Immigration Cases
          </NavLink>
          <NavLink to="/knowledge" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Knowledge RAG
          </NavLink>
          <NavLink to="/drafts" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Drafts & Letters
          </NavLink>
          <NavLink to="/reminders" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Reminders
          </NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
