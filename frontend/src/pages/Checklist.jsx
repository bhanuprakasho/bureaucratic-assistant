import React, { useState, useEffect } from 'react';
import { fetchAllServices, fetchChecklistByService, saveChecklist } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ListChecks, CheckSquare, Square, RefreshCw, Save, Loader, CheckCircle } from 'lucide-react';

const Checklist = () => {
  const { isAuthenticated } = useAuth();
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        const res = await fetchAllServices();
        if (res.success && res.data.length > 0) {
          setServices(res.data);
          const defaultService = res.data[0];
          setSelectedServiceId(defaultService.id);
          await loadServiceChecklist(defaultService.id);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch services list.');
      } finally {
        setLoading(false);
      }
    };
    loadServices();
  }, []);

  const loadServiceChecklist = async (serviceId) => {
    try {
      const res = await fetchChecklistByService(serviceId);
      if (res.success && res.data) {
        setChecklist(res.data.items || []);
      }
    } catch (err) {
      console.warn('Could not load saved checklist, falling back to service defaults');
    }
  };

  const handleServiceChange = async (e) => {
    const serviceId = e.target.value;
    setSelectedServiceId(serviceId);
    setSavedNotice(false);
    await loadServiceChecklist(serviceId);
  };

  const toggleItem = (itemId) => {
    setSavedNotice(false);
    setChecklist(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, checked: !item.checked };
      }
      return item;
    }));
  };

  const handleSaveProgress = async () => {
    if (!isAuthenticated) {
      alert('Sign in to persist your checklist across sessions.');
      return;
    }

    setSaving(true);
    setSavedNotice(false);
    try {
      const s = services.find(srv => srv.id === selectedServiceId);
      const res = await saveChecklist(selectedServiceId, {
        items: checklist,
        serviceName: s ? s.name : selectedServiceId
      });

      if (res.success) {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
      }
    } catch (err) {
      alert('Failed to save checklist progress to database.');
    } finally {
      setSaving(false);
    }
  };

  const completedCount = checklist.filter(i => i.checked).length;
  const totalCount = checklist.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader className="spin" size={32} color="var(--primary)" />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading checklist...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={28} color="var(--primary)" />
            Persistent Document Checklist
          </h1>
          <p className="page-subtitle">
            Generate and track required documents tailored to specific government applications before visiting official offices.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSaveProgress}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Checklist Progress'}
        </button>
      </div>

      {savedNotice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>Checklist progress saved successfully to backend SQLite database!</span>
        </div>
      )}

      {/* Service Selector Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Select Government Service Application:</label>
          <select
            className="form-select"
            value={selectedServiceId}
            onChange={handleServiceChange}
            style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '1rem', padding: '0.75rem' }}
          >
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Checklist Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 className="card-title" style={{ fontSize: '1.15rem' }}>
            Required Documents Checklist
          </h2>
          <span className="badge badge-info" style={{ fontSize: '0.85rem' }}>
            {completedCount} of {totalCount} Gathered ({progressPercentage}%)
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: '8px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ height: '100%', width: `${progressPercentage}%`, background: progressPercentage === 100 ? '#22c55e' : 'var(--primary)', transition: 'width 0.3s' }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {checklist.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                background: item.checked ? '#f0fdf4' : '#ffffff',
                border: '1px solid',
                borderColor: item.checked ? '#bbf7d0' : 'var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {item.checked ? (
                <CheckSquare size={22} color="#16a34a" />
              ) : (
                <Square size={22} color="#94a3b8" />
              )}
              <span style={{ fontSize: '0.95rem', fontWeight: item.checked ? 600 : 500, color: item.checked ? '#166534' : '#1e293b', textDecoration: item.checked ? 'line-through' : 'none' }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Checklist;
