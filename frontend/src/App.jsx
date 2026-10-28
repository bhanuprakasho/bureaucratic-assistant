import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Pages
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import DocumentUpload from './pages/DocumentUpload';
import Eligibility from './pages/Eligibility';
import Checklist from './pages/Checklist';
import ScamVerification from './pages/ScamVerification';
import ImmigrationCases from './pages/ImmigrationCases';
import ImmigrationCaseDetail from './pages/ImmigrationCaseDetail';
import KnowledgeBase from './pages/KnowledgeBase';
import ApplicationDrafts from './pages/ApplicationDrafts';
import RemindersPage from './pages/RemindersPage';
import Login from './pages/Login';
import Register from './pages/Register';

// 404 Fallback Page
function NotFound() {
  return (
    <div className="card" style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center', padding: '3rem' }}>
      <h1 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>404</h1>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#334155' }}>Page Not Found</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        The requested navigation route does not exist.
      </p>
      <Link to="/" className="btn btn-primary">
        Return to Dashboard
      </Link>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/services" element={<Services />} />
              <Route path="/eligibility" element={<Eligibility />} />
              <Route path="/checklist" element={<Checklist />} />
              <Route path="/scam-verify" element={<ScamVerification />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected Citizen & Reviewer Routes */}
              <Route
                path="/upload"
                element={
                  <ProtectedRoute>
                    <DocumentUpload />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/immigration"
                element={
                  <ProtectedRoute>
                    <ImmigrationCases />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/immigration/:id"
                element={
                  <ProtectedRoute>
                    <ImmigrationCaseDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/drafts"
                element={
                  <ProtectedRoute>
                    <ApplicationDrafts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reminders"
                element={
                  <ProtectedRoute>
                    <RemindersPage />
                  </ProtectedRoute>
                }
              />

              {/* 404 Catch-All */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
