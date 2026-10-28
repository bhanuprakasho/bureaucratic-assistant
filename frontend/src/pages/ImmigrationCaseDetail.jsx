import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchImmigrationCaseById, linkDocumentToCase, updateCaseFlag, recordCaseDecision, uploadDocument, fetchUserDocuments, getDocumentFileUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, AlertTriangle, CheckCircle, Clock, FileText, ArrowLeft, Plus, Download, UserCheck, ShieldAlert, Loader } from 'lucide-react';

const ImmigrationCaseDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Attach Document State
  const [showDocModal, setShowDocModal] = useState(false);
  const [userDocs, setUserDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [docRole, setDocRole] = useState('PRIMARY_PASSPORT');
  const [linking, setLinking] = useState(false);

  // Quick Synthetic Fixture Upload State
  const [uploadingFixture, setUploadingFixture] = useState(false);

  // Reviewer Decision State
  const [decision, setDecision] = useState('APPROVED');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [recordingDecision, setRecordingDecision] = useState(false);

  const isReviewerOrAdmin = ['reviewer', 'admin'].includes(user?.role);

  const loadCase = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchImmigrationCaseById(id);
      if (res.success) {
        setCaseData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load case details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCase();
  }, [id]);

  const openAttachModal = async () => {
    try {
      const docsRes = await fetchUserDocuments(isReviewerOrAdmin);
      if (docsRes.success) {
        setUserDocs(docsRes.data);
        if (docsRes.data.length > 0) {
          setSelectedDocId(docsRes.data[0].id);
        }
      }
      setShowDocModal(true);
    } catch (err) {
      alert('Could not fetch documents list.');
    }
  };

  const handleLinkDoc = async (e) => {
    e.preventDefault();
    if (!selectedDocId) return;

    setLinking(true);
    try {
      const res = await linkDocumentToCase(id, {
        document_id: selectedDocId,
        doc_role: docRole
      });
      if (res.success) {
        setShowDocModal(false);
        await loadCase();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to link document.');
    } finally {
      setLinking(false);
    }
  };

  // Uploads a fast synthetic test document and links it to case
  const handleUploadSyntheticFixture = async (fixtureType) => {
    setUploadingFixture(true);
    try {
      let content = '';
      let filename = '';

      if (fixtureType === 'passport_valid') {
        filename = 'synthetic_passport_valid.txt';
        content = `REPUBLIC OF INDIA - PASSPORT\nPassport No: Z9182736\nSurname: SHARMA\nGiven Name(s): RAHUL\nNationality: INDIAN\nSex: MALE\nDate of Birth: 14/08/1995\nPlace of Birth: DELHI\nDate of Issue: 10/05/2020\nDate of Expiry: 09/05/2030`;
      } else if (fixtureType === 'passport_expired') {
        filename = 'synthetic_passport_expired.txt';
        content = `REPUBLIC OF INDIA - PASSPORT\nPassport No: P1029384\nSurname: SHARMA\nGiven Name(s): RAHUL\nNationality: INDIAN\nSex: MALE\nDate of Birth: 14/08/1995\nPlace of Birth: DELHI\nDate of Issue: 01/01/2010\nDate of Expiry: 31/12/2020`;
      } else if (fixtureType === 'aadhaar_matching') {
        filename = 'synthetic_aadhaar_matching.txt';
        content = `GOVERNMENT OF INDIA\nUNIQUE IDENTIFICATION AUTHORITY OF INDIA\nEnrollment No: 1234/56789/01234\nName: Rahul Sharma\nDOB: 14/08/1995\nGender: MALE\nAadhaar Number: 5482 9102 3847`;
      } else if (fixtureType === 'aadhaar_mismatched') {
        filename = 'synthetic_aadhaar_mismatch_name_dob.txt';
        content = `GOVERNMENT OF INDIA\nUNIQUE IDENTIFICATION AUTHORITY OF INDIA\nName: Amit Kumar Verma\nDOB: 22/11/1998\nGender: MALE\nAadhaar Number: 9988 7766 5544`;
      }

      const file = new File([content], filename, { type: 'text/plain' });
      const uploadRes = await uploadDocument(file, true);
      if (uploadRes.success && uploadRes.documentId) {
        await linkDocumentToCase(id, {
          document_id: uploadRes.documentId,
          doc_role: fixtureType.startsWith('passport') ? 'PRIMARY_PASSPORT' : 'NATIONAL_ID'
        });
        await loadCase();
      }
    } catch (err) {
      alert('Error uploading fixture: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploadingFixture(false);
    }
  };

  const handleUpdateFlag = async (flagId, newStatus) => {
    const comment = prompt(`Provide justification for setting flag to ${newStatus}:`, `Inspected by ${user?.full_name || 'Reviewer'}`);
    if (comment === null) return;

    try {
      const res = await updateCaseFlag(id, flagId, {
        status: newStatus,
        reviewer_comment: comment
      });
      if (res.success) {
        await loadCase();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update flag.');
    }
  };

  const handleRecordDecision = async (e) => {
    e.preventDefault();
    if (!reviewerNotes.trim()) {
      alert('Reviewer decision notes are required for official audit accountability.');
      return;
    }

    setRecordingDecision(true);
    try {
      const res = await recordCaseDecision(id, {
        decision,
        notes: reviewerNotes
      });
      if (res.success) {
        alert(`Case decision successfully recorded as: ${decision}`);
        await loadCase();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record decision.');
    } finally {
      setRecordingDecision(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader className="spin" size={32} color="var(--primary)" />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading screening case investigation...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center', borderColor: 'var(--danger)' }}>
        <h2 style={{ color: 'var(--danger)' }}>Error Loading Case</h2>
        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>{error || 'Case not found.'}</p>
        <Link to="/immigration" className="btn btn-primary">Return to Case List</Link>
      </div>
    );
  }

  const { case: c, documents, flags, auditLogs } = caseData;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/immigration" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>
          <ArrowLeft size={16} /> Back to Screening Cases
        </Link>
      </div>

      {/* Case Header Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '5px solid var(--primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                {c.case_number}
              </h1>
              <span className={`badge ${c.status === 'APPROVED' ? 'badge-success' : (c.status === 'REJECTED' ? 'badge-danger' : 'badge-warning')}`}>
                {c.status}
              </span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginTop: '0.25rem' }}>
              Applicant: {c.applicant_name} {c.applicant_email ? `(${c.applicant_email})` : ''}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              Category: {c.category} | Created: {new Date(c.created_at).toLocaleString()} | Creator: {c.creator_name || 'Citizen'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={openAttachModal} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
              <Plus size={16} /> Attach Stored Document
            </button>
          </div>
        </div>
      </div>

      {/* Fast Synthetic Fixture Buttons (For Evaluation Demonstration) */}
      <div className="card" style={{ background: '#f8fafc', marginBottom: '1.5rem', padding: '0.85rem 1.25rem', borderStyle: 'dashed' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
          Academic Evaluation Tools: Quick Inject Synthetic Identity Fixtures
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            disabled={uploadingFixture}
            onClick={() => handleUploadSyntheticFixture('passport_valid')}
          >
            + Valid Passport (Rahul Sharma)
          </button>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            disabled={uploadingFixture}
            onClick={() => handleUploadSyntheticFixture('aadhaar_matching')}
          >
            + Matching Aadhaar (Consistent)
          </button>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: '#ef4444', color: '#b91c1c' }}
            disabled={uploadingFixture}
            onClick={() => handleUploadSyntheticFixture('passport_expired')}
          >
            + Expired Passport (Triggers Expiry Flag)
          </button>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: '#ef4444', color: '#b91c1c' }}
            disabled={uploadingFixture}
            onClick={() => handleUploadSyntheticFixture('aadhaar_mismatched')}
          >
            + Mismatched ID (Triggers Name & DOB Flag)
          </button>
        </div>
      </div>

      {/* Section 1: Attached Documents & Side-by-Side OCR Extraction */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FileText size={20} color="var(--primary)" /> Attached Identity Documents ({documents.length})
        </h2>

        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No documents attached yet. Click "Attach Stored Document" or use the synthetic test fixtures above.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>{doc.doc_role}</span>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary)' }}>{doc.original_name}</h3>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Detected: {doc.document_type} (Confidence: {doc.confidence})</div>
                  </div>
                  <a
                    href={getDocumentFileUrl(doc.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    <Download size={12} /> View File
                  </a>
                </div>

                <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', fontSize: '0.825rem' }}>
                  <strong>Extracted Key Fields:</strong>
                  <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {Object.entries(doc.extractedFields).length === 0 ? (
                      <span style={{ color: 'var(--text-muted)' }}>No standard structured fields extracted.</span>
                    ) : (
                      Object.entries(doc.extractedFields).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #e2e8f0', paddingBottom: '0.15rem' }}>
                          <span style={{ color: '#475569' }}>{k}:</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{String(v)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Automated Screening Flags */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={20} color="var(--danger)" /> Automated Security & Discrepancy Flags ({flags.length})
        </h2>

        {flags.length === 0 ? (
          <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '0.9rem' }}>
            ✓ No automated discrepancies or security flags detected across attached documents.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            {flags.map((flag) => (
              <div key={flag.id} style={{
                border: '1px solid',
                borderColor: flag.status === 'RESOLVED' ? '#86efac' : (flag.status === 'DISMISSED' ? '#cbd5e1' : '#fca5a5'),
                borderRadius: '8px',
                padding: '1rem',
                background: flag.status === 'RESOLVED' ? '#f0fdf4' : (flag.status === 'DISMISSED' ? '#f8fafc' : '#fff5f5')
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${flag.severity === 'CRITICAL' || flag.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`}>
                        {flag.severity}
                      </span>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{flag.title}</strong>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Status: {flag.status}</span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#334155', marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                      {flag.description}
                    </p>
                    {flag.reviewer_comment && (
                      <div style={{ fontSize: '0.8rem', color: '#1e40af', background: '#eff6ff', padding: '0.35rem 0.5rem', borderRadius: '4px', marginTop: '0.35rem' }}>
                        <strong>Reviewer Comment:</strong> {flag.reviewer_comment}
                      </div>
                    )}
                  </div>

                  {isReviewerOrAdmin && (
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {flag.status === 'ACTIVE' && (
                        <>
                          <button
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#166534', borderColor: '#22c55e' }}
                            onClick={() => handleUpdateFlag(flag.id, 'RESOLVED')}
                          >
                            Resolve Flag
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#475569', borderColor: '#94a3b8' }}
                            onClick={() => handleUpdateFlag(flag.id, 'DISMISSED')}
                          >
                            Dismiss Flag
                          </button>
                        </>
                      )}
                      {flag.status !== 'ACTIVE' && (
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleUpdateFlag(flag.id, 'ACTIVE')}
                        >
                          Reopen Flag
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Official Review Decision Panel (Reviewers & Admins) */}
      {isReviewerOrAdmin && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '5px solid #2563eb' }}>
          <h2 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserCheck size={20} color="#2563eb" /> Official Review Decision & Conclusion
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
            As an authorized government screening reviewer, record your formal conclusion regarding this case.
          </p>

          <form onSubmit={handleRecordDecision}>
            <div className="form-group">
              <label className="form-label">Review Decision</label>
              <select
                className="form-select"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                <option value="APPROVED">APPROVED — Documentation verified consistent & valid</option>
                <option value="REJECTED">REJECTED — Critical discrepancy / expired / ineligible</option>
                <option value="REQUIRES_MORE_INFO">REQUIRES_MORE_INFO — Additional original verification needed</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Reviewer Notes & Justification (Recorded in Audit Trail)</label>
              <textarea
                className="form-control"
                rows="3"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Detail the rationale, verified parameters, and any discrepancies addressed during screening..."
                required
              ></textarea>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={recordingDecision}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ShieldCheck size={18} />
              {recordingDecision ? 'Recording Decision...' : 'Record Binding Review Decision'}
            </button>
          </form>
        </div>
      )}

      {/* Existing Decision Notice (if already decided) */}
      {c.reviewer_decision && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f8fafc', borderColor: '#94a3b8' }}>
          <h3 style={{ fontSize: '1rem', color: '#1e293b', marginBottom: '0.35rem' }}>
            Recorded Reviewer Conclusion: <strong>{c.reviewer_decision}</strong>
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.25rem' }}>
            <strong>Officer:</strong> {c.reviewer_name || 'Designated Reviewer'} | <strong>Date:</strong> {c.decision_date ? new Date(c.decision_date).toLocaleString() : 'N/A'}
          </p>
          <div style={{ fontSize: '0.85rem', color: '#334155', background: 'white', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
            "{c.reviewer_notes}"
          </div>
        </div>
      )}

      {/* Section 4: Audit History */}
      <div className="card">
        <h2 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Clock size={20} color="var(--primary)" /> Tamper-Evident Audit History
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          {auditLogs.map((log) => (
            <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.825rem' }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>[{log.action}]</span> by {log.actor_name || 'System'} ({log.actor_role || 'audit'})
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Details: {log.details}</div>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attach Document Modal */}
      {showDocModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', background: 'white' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              Attach Stored Document to Case
            </h2>
            <form onSubmit={handleLinkDoc}>
              <div className="form-group">
                <label className="form-label">Select Document</label>
                <select
                  className="form-select"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  {userDocs.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.original_name} ({d.document_type || 'Unknown'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Document Role in Screening</label>
                <select
                  className="form-select"
                  value={docRole}
                  onChange={(e) => setDocRole(e.target.value)}
                >
                  <option value="PRIMARY_PASSPORT">Primary Passport</option>
                  <option value="NATIONAL_ID">National ID (Aadhaar / Voter ID)</option>
                  <option value="DRIVING_LICENCE">Driving Licence</option>
                  <option value="INCOME_PROOF">Income / Tax Clearance</option>
                  <option value="SUPPORTING">Supporting Document</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowDocModal(false)} disabled={linking}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={linking}>
                  {linking ? 'Linking & Screening...' : 'Attach & Run Screening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImmigrationCaseDetail;
