import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchImmigrationCases, createImmigrationCase } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Plus, FolderOpen, AlertTriangle, CheckCircle, Clock, FileText, UserCheck, Loader } from 'lucide-react';

const ImmigrationCases = () => {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Case Form State
  const [showModal, setShowModal] = useState(false);
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [category, setCategory] = useState('Passport & Identity Cross-Verification');
  const [creating, setCreating] = useState(false);

  const isReviewerOrAdmin = ['reviewer', 'admin'].includes(user?.role);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchImmigrationCases();
      if (res.success) {
        setCases(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load immigration cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!applicantName.trim()) return;

    setCreating(true);
    try {
      const res = await createImmigrationCase({
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        category
      });
      if (res.success) {
        setShowModal(false);
        setApplicantName('');
        setApplicantEmail('');
        await loadCases();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create case');
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={12} /> Approved</span>;
      case 'REJECTED':
        return <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><AlertTriangle size={12} /> Rejected</span>;
      case 'REQUIRES_MORE_INFO':
        return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={12} /> Needs Info</span>;
      default:
        return <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={12} /> Pending Review</span>;
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={28} color="var(--primary)" />
            Immigration & Identity Screening Portal
          </h1>
          <p className="page-subtitle">
            {isReviewerOrAdmin
              ? 'Official Reviewer Workstation: Inspect submitted cases, cross-examine identity documents, and record official verification findings.'
              : 'Submit and track identity screening dossiers, cross-document verification flags, and review status.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Plus size={18} /> Initiate New Screening Case
        </button>
      </div>

      {isReviewerOrAdmin && (
        <div className="card" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', marginBottom: '1.5rem', padding: '0.85rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontWeight: 600 }}>
            <UserCheck size={20} />
            <span>Authorized Reviewer Session Active ({user.full_name} - {user.role.toUpperCase()})</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#3b82f6', marginTop: '0.25rem', marginBottom: 0 }}>
            You have authorization to review security flags, dismiss non-critical discrepancies with justification, and issue binding review conclusions.
          </p>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader className="spin" size={32} color="var(--primary)" />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading screening cases...</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <FolderOpen size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>No Screening Cases Found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Get started by initiating a new case to link and cross-verify identity documents.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Initiate Case Now
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', fontSize: '0.825rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Case Number</th>
                <th style={{ padding: '0.85rem 1rem' }}>Applicant Name</th>
                <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                <th style={{ padding: '0.85rem 1rem' }}>Active Flags</th>
                <th style={{ padding: '0.85rem 1rem' }}>Review Status</th>
                <th style={{ padding: '0.85rem 1rem' }}>Created</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>
                    {c.case_number}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{c.applicant_name}</div>
                    {c.applicant_email && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.applicant_email}</div>}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: '#475569' }}>
                    {c.category}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {c.active_flags_count > 0 ? (
                      <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <AlertTriangle size={12} /> {c.active_flags_count} Discrepancy
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <CheckCircle size={12} /> Clear
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {getStatusBadge(c.status)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.825rem' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <Link to={`/immigration/${c.id}`} className="btn btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.825rem' }}>
                      Inspect Case
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Initiate Case Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', background: 'white' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              Initiate New Screening Case
            </h2>
            <form onSubmit={handleCreateCase}>
              <div className="form-group">
                <label className="form-label">Applicant Full Name (As in Official Passport/ID)</label>
                <input
                  type="text"
                  className="form-control"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Applicant Contact Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  placeholder="e.g. rahul.sharma@example.com"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Screening Category</label>
                <select
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Passport & Identity Cross-Verification">Passport & Identity Cross-Verification</option>
                  <option value="Student Visa Supporting Clearance">Student Visa Supporting Clearance</option>
                  <option value="OCI / Citizenship Eligibility Screening">OCI / Citizenship Eligibility Screening</option>
                  <option value="Employment Verification Clearance">Employment Verification Clearance</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating Case...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImmigrationCases;
