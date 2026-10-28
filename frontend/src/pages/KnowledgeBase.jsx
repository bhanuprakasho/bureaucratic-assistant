import React, { useState, useEffect } from 'react';
import { fetchArticles, searchKnowledge, askAssistant, createArticle } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Search, Send, ShieldCheck, ExternalLink, Calendar, Plus, Loader } from 'lucide-react';

const KnowledgeBase = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Assistant QA State
  const [question, setQuestion] = useState('');
  const [assistantResponse, setAssistantResponse] = useState(null);
  const [asking, setAsking] = useState(false);

  // Admin Add Article Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Identity');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newPortal, setNewPortal] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newFee, setNewFee] = useState('');
  const [publishing, setPublishing] = useState(false);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const res = await fetchArticles();
      if (res.success) {
        setArticles(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const res = await searchKnowledge(searchQuery);
      if (res.success) {
        setSearchResults(res.results);
      }
    } catch (err) {
      alert('Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setAsking(true);
    try {
      const res = await askAssistant(question);
      if (res.success) {
        setAssistantResponse(res);
      }
    } catch (err) {
      alert('Failed to get answer from knowledge assistant.');
    } finally {
      setAsking(false);
    }
  };

  const handleCreateArticle = async (e) => {
    e.preventDefault();
    setPublishing(true);
    try {
      const res = await createArticle({
        title: newTitle,
        category: newCategory,
        source_url: newSourceUrl,
        official_portal: newPortal,
        summary: newSummary,
        content: newContent,
        official_fee: newFee
      });
      if (res.success) {
        setShowAddModal(false);
        setNewTitle('');
        setNewSourceUrl('');
        setNewPortal('');
        setNewSummary('');
        setNewContent('');
        setNewFee('');
        await loadArticles();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to publish article.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={28} color="var(--primary)" />
            Official Government Knowledge Base & Grounded Assistant
          </h1>
          <p className="page-subtitle">
            Search verified regulations, official portals, and gazette guidelines with transparent citations and source URLs.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Plus size={18} /> Publish New Guideline (Admin)
          </button>
        )}
      </div>

      {/* Assistant QA Box */}
      <div className="card" style={{ marginBottom: '2rem', background: '#f8fafc', borderLeft: '5px solid var(--accent)' }}>
        <h2 style={{ fontSize: '1.15rem', color: 'var(--primary)', marginBottom: '0.5rem', fontWeight: 700 }}>
          Ask Grounded Knowledge Assistant
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1rem' }}>
          Ask questions regarding document requirements, procedures, fees, or official deadlines. Answers are synthesized exclusively from verified government records without hallucination.
        </p>

        <form onSubmit={handleAsk} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-control"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What documents and fees are required for post-matric scholarship?"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={asking} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Send size={16} /> {asking ? 'Synthesizing...' : 'Ask'}
          </button>
        </form>

        {assistantResponse && (
          <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#166534', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={16} /> Grounded Answer (Verified Official Sources):
            </div>
            <p style={{ fontSize: '0.9rem', color: '#1e293b', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
              {assistantResponse.answer}
            </p>
            {assistantResponse.sources?.length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Cited Official Portals:</span>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  {assistantResponse.sources.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {s.title} ({s.official_portal}) <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="form-control"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services, schemes, guidelines by keyword..."
              style={{ paddingLeft: '2.5rem' }}
            />
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          </div>
          <button type="submit" className="btn btn-outline" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
          {searchResults && (
            <button type="button" className="btn btn-outline" onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Display Search Results if active */}
      {searchResults && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
            Search Results ({searchResults.length} matches)
          </h2>
          {searchResults.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No matches found for query "{searchQuery}".</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {searchResults.map((res, i) => (
                <div key={i} style={{ padding: '0.85rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)' }}>{res.title}</h3>
                    <span className="badge badge-info">{res.category}</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.25rem', marginBottom: '0.5rem' }}>{res.snippet}</p>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.775rem', color: '#64748b' }}>
                    <span>Portal: <strong>{res.official_portal}</strong></span>
                    <span>Fee: <strong>{res.official_fee}</strong></span>
                    <a href={res.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      Verify Portal <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Official Guidelines Directory */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
        Verified Official Knowledge Articles
      </h2>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader className="spin" size={32} color="var(--primary)" />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading verified articles...</p>
        </div>
      ) : (
        <div className="card-grid">
          {articles.map((art) => (
            <div key={art.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-info">{art.category}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Calendar size={12} /> Verified: {art.verification_date}
                  </span>
                </div>
                <h3 className="card-title" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{art.title}</h3>
                <p className="card-desc" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{art.summary}</p>
                <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', color: '#334155', border: '1px solid var(--border)' }}>
                  <strong>Official Fee:</strong> {art.official_fee || 'Free'}
                </div>
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{art.official_portal}</span>
                <a
                  href={art.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                >
                  Official Portal <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin Add Article Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              Publish Official Guideline Article (Admin)
            </h2>
            <form onSubmit={handleCreateArticle}>
              <div className="form-group">
                <label className="form-label">Article Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Voter ID Enrolment Form 6 Guidelines"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                  <option value="Identity">Identity</option>
                  <option value="Tax & Financial">Tax & Financial</option>
                  <option value="Education">Education</option>
                  <option value="Transport">Transport</option>
                  <option value="Welfare & Subsidies">Welfare & Subsidies</option>
                  <option value="Travel & Immigration">Travel & Immigration</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Official Portal Hostname</label>
                <input
                  type="text"
                  className="form-control"
                  value={newPortal}
                  onChange={(e) => setNewPortal(e.target.value)}
                  placeholder="e.g. voters.eci.gov.in"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Direct Government Source URL</label>
                <input
                  type="url"
                  className="form-control"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://voters.eci.gov.in"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Official Fee Structure</label>
                <input
                  type="text"
                  className="form-control"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  placeholder="e.g. Free for new voter registration"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Executive Summary</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Brief synopsis of requirements..."
                  required
                ></textarea>
              </div>

              <div className="form-group">
                <label className="form-label">Full Directive Content</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Step-by-step procedures and criteria..."
                  required
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)} disabled={publishing}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={publishing}>
                  {publishing ? 'Publishing...' : 'Publish to Knowledge Base'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
