import React, { useState, useEffect } from 'react';
import { analyzeScamMessage, fetchSavedScamReports } from '../services/api';
import { ShieldAlert, AlertTriangle, CheckCircle, ShieldCheck, Cpu, ExternalLink, Clock, History, Loader } from 'lucide-react';

const ScamVerification = () => {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const loadReports = async () => {
    try {
      setLoadingReports(true);
      const res = await fetchSavedScamReports();
      if (res.success) {
        setReports(res.data);
      }
    } catch (err) {
      console.warn('Could not load saved reports');
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await analyzeScamMessage(message);
      if (data.success) {
        setResult(data);
        await loadReports();
      } else {
        setError(data.message || 'Analysis failed.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Server error analyzing message.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetSample = (sampleText) => {
    setMessage(sampleText);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={28} color="var(--danger)" />
          Scam & Impersonation Verification Engine
        </h1>
        <p className="page-subtitle">
          Screen suspicious SMS alerts, WhatsApp notices, emails, or links using our trained Logistic Regression TF-IDF ML model combined with transparent government domain indicators.
        </p>
      </div>

      {/* Main Analyzer Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleAnalyze}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>
              Paste Suspicious Message, Notice, or Web Link:
            </label>
            <textarea
              className="form-control"
              rows="4"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Dear user your power connection will be disconnected tonight at 9.30 PM immediately contact officer at 9812345678 or pay fine at http://bescom-pay.xyz"
              required
            ></textarea>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.65rem 1.25rem' }}
            >
              <Cpu size={16} /> {loading ? 'Analyzing with ML & Rules...' : 'Analyze Message'}
            </button>

            {/* Quick Test Samples */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', alignSelf: 'center' }}>Test Cases:</span>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => handleSetSample("Dear Customer, Your Electricity power connection will be cut tonight at 9.30 PM from office because your previous month bill was not updated. Please immediately contact our officer at 9812345678 or pay immediately via http://bescom-pay.xyz/bill")}
              >
                Electricity Scam
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => handleSetSample("Income Tax Refund Notice: You have an uncashed tax refund of Rs. 15,490 from Income Tax Department India. Click http://incometax-refund-portal.top to enter Aadhaar OTP and claim refund within 2 hours.")}
              >
                Tax Refund Phishing
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => handleSetSample("Dear Resident, Aadhaar update request with URN 0000/12345/67890 has been processed successfully. You can download your e-Aadhaar from https://myaadhaar.uidai.gov.in. UIDAI never asks for OTP over phone.")}
              >
                Genuine Notice
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Analysis Results Display */}
      {result && (
        <div className="card" style={{
          marginBottom: '2rem',
          borderLeft: result.riskLevel === 'HIGH' ? '6px solid #ef4444' : (result.riskLevel === 'MEDIUM' ? '6px solid #eab308' : '6px solid #22c55e')
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`badge ${result.riskLevel === 'HIGH' ? 'badge-danger' : (result.riskLevel === 'MEDIUM' ? 'badge-warning' : 'badge-success')}`} style={{ fontSize: '0.9rem', padding: '0.35rem 0.75rem' }}>
                  {result.riskLevel} RISK ({result.riskScore}/100)
                </span>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                  Model: {result.modelUsed}
                </span>
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.5rem' }}>
                Scam Analysis & Vulnerability Assessment
              </h2>
            </div>

            {/* Model Probability Badge */}
            {result.mlProbability !== null && (
              <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ML Model Spam Probability</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: result.mlProbability > 0.5 ? '#dc2626' : '#16a34a' }}>
                  {(result.mlProbability * 100).toFixed(1)}% ({result.mlPrediction.toUpperCase()})
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
              Actionable Safety Recommendation:
            </h3>
            <div style={{ background: result.riskLevel === 'HIGH' ? '#fef2f2' : (result.riskLevel === 'MEDIUM' ? '#fefce8' : '#f0fdf4'), padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.9rem', color: '#1e293b', border: '1px solid var(--border)' }}>
              {result.recommendation}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
              Detected Threat Signals & Indicators:
            </h3>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {result.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            {result.disclaimer}
          </div>
        </div>
      )}

      {/* History of Saved Reports */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <History size={20} /> Saved Scam Verification Reports ({reports.length})
      </h2>

      {loadingReports ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <Loader className="spin" size={24} color="var(--primary)" />
        </div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          No previous scam analyses saved.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {reports.map((rep) => (
            <div key={rep.id} className="card" style={{ padding: '0.85rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`badge ${rep.risk_level === 'HIGH' ? 'badge-danger' : (rep.risk_level === 'MEDIUM' ? 'badge-warning' : 'badge-success')}`} style={{ fontSize: '0.75rem' }}>
                    {rep.risk_level} ({rep.risk_score}/100)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ML: {rep.ml_prediction}</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {new Date(rep.created_at).toLocaleString()}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{rep.message_text}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScamVerification;
