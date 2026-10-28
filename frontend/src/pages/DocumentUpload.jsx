import React, { useState, useEffect } from 'react';
import { uploadDocument, fetchUserDocuments, confirmDocumentFields, deleteDocument, getDocumentFileUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, Download, Check, Edit2, Loader, ShieldCheck } from 'lucide-react';

const DocumentUpload = () => {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [isSynthetic, setIsSynthetic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');

  // Stored Documents Vault State
  const [documents, setDocuments] = useState([]);
  const [loadingVault, setLoadingVault] = useState(false);

  // Field Confirmation State
  const [editingFields, setEditingFields] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);

  const loadVault = async () => {
    try {
      setLoadingVault(true);
      const res = await fetchUserDocuments();
      if (res.success) {
        setDocuments(res.data);
      }
    } catch (err) {
      console.warn('Could not load documents vault');
    } finally {
      setLoadingVault(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setLoading(true);
    setError('');
    setUploadResult(null);
    setConfirmedSuccess(false);

    try {
      const res = await uploadDocument(file, isSynthetic);
      if (res.success) {
        setUploadResult(res);
        setEditingFields({ ...res.result.extractedFields });
        await loadVault();
      } else {
        setError(res.message || 'Upload processing failed.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Server error uploading file.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmFields = async () => {
    if (!uploadResult || !uploadResult.documentId) return;

    setConfirming(true);
    try {
      const res = await confirmDocumentFields(uploadResult.documentId, {
        confirmedFields: editingFields,
        documentType: uploadResult.result.documentType
      });

      if (res.success) {
        setConfirmedSuccess(true);
        await loadVault();
      }
    } catch (err) {
      alert('Failed to save confirmed fields.');
    } finally {
      setConfirming(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to permanently delete this document and its private storage file?')) return;
    try {
      await deleteDocument(id);
      await loadVault();
      if (uploadResult && uploadResult.documentId === id) {
        setUploadResult(null);
      }
    } catch (err) {
      alert('Failed to delete document.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Upload size={28} color="var(--primary)" />
          Private Document OCR & Extraction Vault
        </h1>
        <p className="page-subtitle">
          Upload identification documents or PDFs for automated Tesseract OCR and text extraction. Verified fields are saved in your private vault for auto-filling schemes and checklists.
        </p>
      </div>

      {/* Upload Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Select Document (Image, Scanned PDF, or Text):</label>
            <input
              type="file"
              className="form-control"
              onChange={handleFileChange}
              accept=".jpg,.jpeg,.png,.webp,.pdf,.txt"
              required
            />
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
              Accepted formats: JPG, PNG, WEBP, PDF, TXT (Maximum: 10MB). Stored in private server directory.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input
              type="checkbox"
              id="syntheticCheck"
              checked={isSynthetic}
              onChange={(e) => setIsSynthetic(e.target.checked)}
            />
            <label htmlFor="syntheticCheck" style={{ fontSize: '0.85rem', color: '#475569', cursor: 'pointer' }}>
              Tag this file as a <strong>Synthetic Test Document</strong> (for evaluation without private real IDs)
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Upload size={16} /> {loading ? 'Extracting Text & OCR...' : 'Upload & Process Document'}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Extraction Results & Field Confirmation */}
      {uploadResult && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '5px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-info">{uploadResult.result.documentType}</span>
                <span className="badge badge-success">Confidence: {uploadResult.result.confidence}</span>
                {uploadResult.is_synthetic && <span className="badge badge-warning">Synthetic</span>}
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.35rem' }}>
                Extraction Results: {uploadResult.filename}
              </h2>
            </div>

            <a
              href={getDocumentFileUrl(uploadResult.documentId)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Download size={14} /> Download File
            </a>
          </div>

          {confirmedSuccess && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle size={18} />
              <span>Extracted fields verified and confirmed by user! Updated in database.</span>
            </div>
          )}

          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            Review & Confirm Extracted Fields (User Verification):
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {Object.keys(editingFields).map((fieldKey) => (
              <div key={fieldKey} style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                  {fieldKey}
                </label>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                  value={editingFields[fieldKey] || ''}
                  onChange={(e) => setEditingFields({ ...editingFields, [fieldKey]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={confirming}
            onClick={handleConfirmFields}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
          >
            <ShieldCheck size={16} /> {confirming ? 'Saving Confirmation...' : 'Confirm Verified Fields'}
          </button>

          {/* Raw Text Accordion Preview */}
          <details style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>
              View Raw OCR Extracted Text
            </summary>
            <pre style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '4px', marginTop: '0.5rem', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
              {uploadResult.result.rawText || 'No text extracted.'}
            </pre>
          </details>
        </div>
      )}

      {/* User Vault List */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
        Your Private Document Vault ({documents.length})
      </h2>

      {loadingVault ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <Loader className="spin" size={24} color="var(--primary)" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
          No documents in your vault yet. Upload an ID above to populate your vault.
        </div>
      ) : (
        <div className="card-grid">
          {documents.map((doc) => (
            <div key={doc.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-info">{doc.document_type || 'Document'}</span>
                  {doc.is_synthetic ? <span className="badge badge-warning">Synthetic</span> : null}
                </div>
                <h3 className="card-title" style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>{doc.original_name}</h3>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Size: {(doc.file_size / 1024).toFixed(1)} KB | Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                <a
                  href={getDocumentFileUrl(doc.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                >
                  <Download size={12} /> View
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: '#ef4444', color: '#dc2626' }}
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
