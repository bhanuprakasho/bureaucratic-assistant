import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchEligibilitySchemes, checkEligibility } from '../services/api';
import { CheckCircle, XCircle, AlertTriangle, FileText, Loader, ArrowRight, ListChecks, FileEdit } from 'lucide-react';

const Eligibility = () => {
  const [schemes, setSchemes] = useState([]);
  const [formData, setFormData] = useState({
    age: '20',
    annualIncome: '180000',
    isStudent: 'yes',
    employmentStatus: 'Student',
    category: 'OBC',
    state: 'Maharashtra',
    schemeId: 'scholarship'
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSchemes = async () => {
      try {
        const data = await fetchEligibilitySchemes();
        if (data.success && data.schemes.length > 0) {
          setSchemes(data.schemes);
          setFormData(prev => ({ ...prev, schemeId: data.schemes[0].scheme_id }));
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch scheme rules from backend database.');
      }
    };
    loadSchemes();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setResult(null);

      const response = await checkEligibility(formData);
      if (response.success) {
        setResult(response);
      } else {
        setError(response.message || 'Eligibility evaluation failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Error connecting to backend eligibility rule engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Basic Scheme Eligibility Checker</h1>
        <p className="page-subtitle">
          Enter your demographic criteria to test eligibility rules against sample government schemes & scholarships.
        </p>
      </div>

      <div className="disclaimer-banner">
        <AlertTriangle size={18} />
        <span>
          <strong>Important Disclaimer:</strong> This is a preliminary rule-based check for demonstration purposes. Official decisions are determined solely by government authorities.
        </span>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            
            {/* Select Scheme */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Select Government Scheme / Scholarship:</label>
              <select
                name="schemeId"
                className="form-select"
                value={formData.schemeId}
                onChange={handleChange}
                style={{ fontWeight: 600, color: 'var(--primary)' }}
              >
                {schemes.map(s => (
                  <option key={s.id} value={s.scheme_id}>
                    {s.scheme_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Age */}
            <div className="form-group">
              <label className="form-label">Age (Years):</label>
              <input
                type="number"
                name="age"
                className="form-input"
                value={formData.age}
                onChange={handleChange}
                min="0"
                max="120"
                required
              />
            </div>

            {/* Income */}
            <div className="form-group">
              <label className="form-label">Annual Family Income (₹):</label>
              <input
                type="number"
                name="annualIncome"
                className="form-input"
                value={formData.annualIncome}
                onChange={handleChange}
                min="0"
                step="5000"
                required
              />
            </div>

            {/* Student Status */}
            <div className="form-group">
              <label className="form-label">Are you currently a student?</label>
              <select name="isStudent" className="form-select" value={formData.isStudent} onChange={handleChange}>
                <option value="yes">Yes (Currently Enrolled)</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Employment Status */}
            <div className="form-group">
              <label className="form-label">Employment Status:</label>
              <select name="employmentStatus" className="form-select" value={formData.employmentStatus} onChange={handleChange}>
                <option value="Student">Student</option>
                <option value="Unemployed">Unemployed</option>
                <option value="Salaried">Salaried / Private</option>
                <option value="Self-Employed">Self-Employed / Farmer</option>
              </select>
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category:</label>
              <select name="category" className="form-select" value={formData.category} onChange={handleChange}>
                <option value="General">General</option>
                <option value="OBC">OBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
                <option value="EWS">EWS</option>
              </select>
            </div>

            {/* State */}
            <div className="form-group">
              <label className="form-label">State of Residence:</label>
              <input
                type="text"
                name="state"
                className="form-input"
                value={formData.state}
                onChange={handleChange}
                placeholder="e.g. Maharashtra, Delhi"
                required
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader className="spin" size={18} /> : <CheckCircle size={18} />} Check Scheme Eligibility
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', backgroundColor: 'var(--danger-bg)', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="card" style={{
          borderLeft: `5px solid ${result.isEligible ? 'var(--success)' : 'var(--danger)'}`,
          backgroundColor: result.isEligible ? 'var(--success-bg)' : 'var(--danger-bg)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: result.isEligible ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {result.isEligible ? <CheckCircle size={26} /> : <XCircle size={26} />}
              {result.status} — {result.schemeName}
            </h2>
            <span className={`badge ${result.isEligible ? 'badge-success' : 'badge-danger'}`}>
              {result.status}
            </span>
          </div>

          {/* Reasons List */}
          <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              Evaluation Reasons:
            </h4>
            <ul style={{ listStyle: 'none', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {result.reasons.map((reason, i) => (
                <li key={i} style={{ color: reason.startsWith('✓') ? 'var(--success)' : 'var(--danger)', marginBottom: '0.25rem' }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          {/* Required Documents */}
          {result.requiredDocuments && result.requiredDocuments.length > 0 && (
            <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={18} /> Required Documents for Application:
              </h4>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {result.requiredDocuments.map((doc, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{doc}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Next Actions */}
          {result.isEligible && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/checklist" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <ListChecks size={16} /> Prepare Document Checklist <ArrowRight size={14} />
              </Link>
              <Link to="/drafts" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <FileEdit size={16} /> Create Application Draft
              </Link>
            </div>
          )}

          <p style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            * {result.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
};

export default Eligibility;
