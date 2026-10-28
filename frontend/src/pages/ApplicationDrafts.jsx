import React, { useState, useEffect } from 'react';
import { fetchUserDrafts, saveDraft, deleteDraft, generateLetter, fetchUserLetters, deleteLetter, fetchAllServices, fetchUserDocuments } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FileEdit, Plus, Save, Trash2, FileText, CheckCircle, Copy, Download, Loader } from 'lucide-react';

const ApplicationDrafts = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('drafts'); // 'drafts' or 'letters'
  const [drafts, setDrafts] = useState([]);
  const [letters, setLetters] = useState([]);
  const [services, setServices] = useState([]);
  const [userDocs, setUserDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Draft Editor State
  const [selectedServiceId, setSelectedServiceId] = useState('scholarship');
  const [applicantName, setApplicantName] = useState(user?.full_name || '');
  const [applicantAadhaar, setApplicantAadhaar] = useState('');
  const [applicantDOB, setApplicantDOB] = useState('');
  const [annualIncome, setAnnualIncome] = useState('180000');
  const [category, setCategory] = useState('OBC');
  const [institution, setInstitution] = useState('Vellore Institute of Technology');
  const [course, setCourse] = useState('B.Tech Computer Science');
  const [savingDraft, setSavingDraft] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null);

  // Letter Generator State
  const [letterType, setLetterType] = useState('SCHOLARSHIP_SOP');
  const [letterTitle, setLetterTitle] = useState('');
  const [recipientOffice, setRecipientOffice] = useState('Directorate of Higher Education / Scholarship Committee');
  const [careerGoal, setCareerGoal] = useState('develop public digital infrastructure as an AI software engineer');
  const [academicScore, setAcademicScore] = useState('8.8 CGPA');
  const [generatedLetter, setGeneratedLetter] = useState(null);
  const [generatingLetter, setGeneratingLetter] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [draftsRes, lettersRes, servicesRes, docsRes] = await Promise.all([
        fetchUserDrafts(),
        fetchUserLetters(),
        fetchAllServices(),
        fetchUserDocuments()
      ]);

      if (draftsRes.success) setDrafts(draftsRes.data);
      if (lettersRes.success) setLetters(lettersRes.data);
      if (servicesRes.success) setServices(servicesRes.data);
      if (docsRes.success) setUserDocs(docsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Autofill fields from confirmed OCR documents
  const handleAutofillFromDoc = (doc) => {
    const fields = doc.extractedFields || {};
    if (fields['Name']) setApplicantName(fields['Name']);
    if (fields['Aadhaar Number']) setApplicantAadhaar(fields['Aadhaar Number']);
    if (fields['Date of Birth']) setApplicantDOB(fields['Date of Birth']);
    if (fields['Annual Income']) setAnnualIncome(fields['Annual Income']);
    alert(`Autofilled fields from verified document: ${doc.original_name}`);
  };

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    setSavingDraft(true);

    const s = services.find(srv => srv.id === selectedServiceId);
    const serviceName = s ? s.name : selectedServiceId;

    const formData = {
      applicantName,
      applicantAadhaar,
      applicantDOB,
      annualIncome,
      category,
      institution,
      course
    };

    try {
      const res = await saveDraft({
        id: editingDraftId,
        service_id: selectedServiceId,
        service_name: serviceName,
        form_data: formData,
        status: 'draft'
      });

      if (res.success) {
        alert(editingDraftId ? 'Draft updated!' : 'Draft created and saved to database!');
        setEditingDraftId(null);
        await loadData();
      }
    } catch (err) {
      alert('Failed to save application draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleReopenDraft = (draft) => {
    setEditingDraftId(draft.id);
    setSelectedServiceId(draft.service_id);
    const data = draft.formData || {};
    if (data.applicantName) setApplicantName(data.applicantName);
    if (data.applicantAadhaar) setApplicantAadhaar(data.applicantAadhaar);
    if (data.applicantDOB) setApplicantDOB(data.applicantDOB);
    if (data.annualIncome) setAnnualIncome(data.annualIncome);
    if (data.category) setCategory(data.category);
    if (data.institution) setInstitution(data.institution);
    if (data.course) setCourse(data.course);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDeleteDraft = async (id) => {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      await deleteDraft(id);
      await loadData();
    } catch (err) {
      alert('Failed to delete draft.');
    }
  };

  const handleGenerateLetter = async (e) => {
    e.preventDefault();
    setGeneratingLetter(true);

    const facts = {
      applicantName,
      annualIncome,
      institution,
      course,
      academicScore,
      careerGoal,
      recipientOffice
    };

    try {
      const res = await generateLetter({
        title: letterTitle || `${letterType} - ${applicantName}`,
        letterType,
        serviceId: selectedServiceId,
        recipientOffice,
        facts
      });

      if (res.success) {
        setGeneratedLetter(res);
        await loadData();
      }
    } catch (err) {
      alert('Failed to generate letter.');
    } finally {
      setGeneratingLetter(false);
    }
  };

  const handleDeleteLetter = async (id) => {
    if (!confirm('Delete this saved letter?')) return;
    try {
      await deleteLetter(id);
      await loadData();
    } catch (err) {
      alert('Failed to delete letter.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileEdit size={28} color="var(--primary)" />
          Application Drafts & Statement Generator
        </h1>
        <p className="page-subtitle">
          Prepare, validate, and persist service application forms autofilled with verified document data, or generate formal Statements of Purpose and affidavits.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn ${activeTab === 'drafts' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('drafts')}
        >
          Application Drafts ({drafts.length})
        </button>
        <button
          className={`btn ${activeTab === 'letters' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('letters')}
        >
          Statement & Letter Generator ({letters.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader className="spin" size={32} color="var(--primary)" />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading application drafts...</p>
        </div>
      ) : activeTab === 'drafts' ? (
        <div>
          {/* Autofill helper from user documents */}
          {userDocs.length > 0 && (
            <div className="card" style={{ background: '#f8fafc', marginBottom: '1.5rem', borderStyle: 'dashed' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                Autofill from Your Verified Documents:
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {userDocs.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => handleAutofillFromDoc(d)}
                  >
                    + Use {d.original_name} ({d.document_type || 'ID'})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Draft Form Card */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.15rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '1rem' }}>
              {editingDraftId ? `Editing Draft #${editingDraftId}` : 'Create New Application Draft'}
            </h2>

            <form onSubmit={handleSaveDraft}>
              <div className="form-group">
                <label className="form-label">Target Government Scheme / Service</label>
                <select
                  className="form-select"
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                >
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Applicant Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Aadhaar Number (12 Digits)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={applicantAadhaar}
                    onChange={(e) => setApplicantAadhaar(e.target.value)}
                    placeholder="XXXX XXXX XXXX"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Date of Birth (DD/MM/YYYY)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={applicantDOB}
                    onChange={(e) => setApplicantDOB(e.target.value)}
                    placeholder="DD/MM/YYYY"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Annual Family Income (INR)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={annualIncome}
                    onChange={(e) => setAnnualIncome(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Social Category</label>
                  <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="General">General</option>
                    <option value="OBC">OBC (Other Backward Classes)</option>
                    <option value="SC">SC (Scheduled Caste)</option>
                    <option value="ST">ST (Scheduled Tribe)</option>
                    <option value="EWS">EWS (Economically Weaker Section)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Enrolled Institution / Board</label>
                  <input
                    type="text"
                    className="form-control"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={savingDraft} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Save size={16} /> {savingDraft ? 'Saving Draft...' : 'Save Draft to Database'}
                </button>
                {editingDraftId && (
                  <button type="button" className="btn btn-outline" onClick={() => setEditingDraftId(null)}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Saved Drafts List */}
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
            Your Saved Application Drafts
          </h2>
          {drafts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No saved application drafts yet. Use the form above to prepare and save a draft.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {drafts.map(d => (
                <div key={d.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1.05rem', color: 'var(--primary)' }}>{d.service_name}</strong>
                      <span className="badge badge-info">{d.status}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                      Draft ID: #{d.id} | Last Saved: {new Date(d.updated_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} onClick={() => handleReopenDraft(d)}>
                      Reopen Draft
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderColor: '#ef4444', color: '#dc2626' }} onClick={() => handleDeleteDraft(d.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Letters Tab */
        <div>
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.15rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
              Personalized Statement & Letter Generator
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1rem' }}>
              Draft official representations grounded in your confirmed facts. No fabricated achievements or unauthorized claims.
            </p>

            <form onSubmit={handleGenerateLetter}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Letter Template Type</label>
                  <select
                    className="form-select"
                    value={letterType}
                    onChange={(e) => setLetterType(e.target.value)}
                  >
                    <option value="SCHOLARSHIP_SOP">Scholarship Statement of Purpose (SOP)</option>
                    <option value="INCOME_JUSTIFICATION">Income Self-Declaration Undertaking</option>
                    <option value="GRIEVANCE_PETITION">Official Delay Grievance Petition</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Addressee / Recipient Authority</label>
                  <input
                    type="text"
                    className="form-control"
                    value={recipientOffice}
                    onChange={(e) => setRecipientOffice(e.target.value)}
                    placeholder="e.g. Directorate of Technical Education"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Academic / Examination Merit</label>
                  <input
                    type="text"
                    className="form-control"
                    value={academicScore}
                    onChange={(e) => setAcademicScore(e.target.value)}
                    placeholder="e.g. 9.1 CGPA / 89% in Higher Secondary"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Career Goal / Post-Graduation Objective</label>
                  <input
                    type="text"
                    className="form-control"
                    value={careerGoal}
                    onChange={(e) => setCareerGoal(e.target.value)}
                    placeholder="e.g. contribute as a systems engineer to national infrastructure"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={generatingLetter}
                style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <FileText size={16} /> {generatingLetter ? 'Generating...' : 'Generate & Save Statement'}
              </button>
            </form>

            {generatedLetter && (
              <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Generated Draft: {generatedLetter.title}</strong>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLetter.content);
                      alert('Letter copied to clipboard!');
                    }}
                  >
                    <Copy size={12} /> Copy Text
                  </button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.875rem', color: '#1e293b', background: 'white', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  {generatedLetter.content}
                </pre>
              </div>
            )}
          </div>

          {/* Saved Letters List */}
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
            Saved Statements & Letters
          </h2>
          {letters.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No saved letters yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {letters.map(l => (
                <div key={l.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>{l.title}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Type: {l.letter_type} | Created: {new Date(l.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderColor: '#ef4444', color: '#dc2626' }}
                    onClick={() => handleDeleteLetter(l.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ApplicationDrafts;
