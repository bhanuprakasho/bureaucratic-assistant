import React, { useState, useEffect } from 'react';
import { fetchReminders, createReminder, updateReminder, deleteReminder, fetchAllServices } from '../services/api';
import { Bell, Plus, CheckCircle, Clock, AlertCircle, Trash2, Calendar, Loader } from 'lucide-react';

const RemindersPage = () => {
  const [reminders, setReminders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Reminder State
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [remRes, servRes] = await Promise.all([
        fetchReminders(),
        fetchAllServices()
      ]);

      if (remRes.success) setReminders(remRes.data);
      if (servRes.success) setServices(servRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title || !dueDate) return;

    setSubmitting(true);
    try {
      const res = await createReminder({
        title,
        due_date: dueDate,
        service_id: serviceId || null,
        document_name: documentName || null,
        notes: notes || null
      });

      if (res.success) {
        setTitle('');
        setDueDate('');
        setServiceId('');
        setDocumentName('');
        setNotes('');
        await loadData();
      }
    } catch (err) {
      alert('Failed to schedule reminder.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleComplete = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED';
    try {
      await updateReminder(id, { status: nextStatus });
      await loadData();
    } catch (err) {
      alert('Failed to update reminder.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      await deleteReminder(id);
      await loadData();
    } catch (err) {
      alert('Failed to delete reminder.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Bell size={28} color="var(--primary)" />
          Document Renewal & Deadline Reminders
        </h1>
        <p className="page-subtitle">
          Automated schedule tracking for passport expiration, driving licence renewals, scholarship windows, and subsidy deadlines.
        </p>
      </div>

      {/* Create Reminder Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: 'var(--primary)', fontWeight: 700, marginBottom: '1rem' }}>
          Schedule a Renewal or Deadline Alert
        </h2>

        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Reminder Title</label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Passport Expiry Renewal Alert"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Expiry / Due Date</label>
              <input
                type="date"
                className="form-control"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Related Government Service (Optional)</label>
              <select
                className="form-select"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">-- None --</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Target Document Name (Optional)</label>
              <input
                type="text"
                className="form-control"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="e.g. Ordinary Indian Passport #Z9182736"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Checklist Action (Optional)</label>
            <input
              type="text"
              className="form-control"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Gather 2 passport photos and address proof before booking PSK slot"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Plus size={16} /> {submitting ? 'Scheduling...' : 'Schedule Reminder'}
          </button>
        </form>
      </div>

      {/* Reminder List */}
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
        Tracked Alerts & Scheduled Renewals ({reminders.length})
      </h2>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader className="spin" size={32} color="var(--primary)" />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading scheduled reminders...</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No reminders scheduled yet. Add an alert above to stay ahead of government expiration dates.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {reminders.map(r => (
            <div
              key={r.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                borderLeft: r.isOverdue ? '5px solid #ef4444' : (r.timingStatus === 'DUE_TODAY' ? '5px solid #eab308' : '5px solid #22c55e')
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '1.05rem', color: r.status === 'COMPLETED' ? '#94a3b8' : 'var(--primary)', textDecoration: r.status === 'COMPLETED' ? 'line-through' : 'none' }}>
                    {r.title}
                  </strong>
                  {r.status === 'COMPLETED' ? (
                    <span className="badge badge-success">Completed</span>
                  ) : r.timingStatus === 'OVERDUE' ? (
                    <span className="badge badge-danger">Overdue ({Math.abs(r.daysRemaining)} days ago)</span>
                  ) : r.timingStatus === 'DUE_TODAY' ? (
                    <span className="badge badge-warning">Due Today</span>
                  ) : (
                    <span className="badge badge-info">{r.daysRemaining} days left</span>
                  )}
                </div>

                <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.35rem' }}>
                  <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                  Due Date: <strong>{r.due_date}</strong>
                  {r.document_name && ` | Document: ${r.document_name}`}
                  {r.notes && ` | Notes: ${r.notes}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleToggleComplete(r.id, r.status)}
                >
                  {r.status === 'COMPLETED' ? 'Mark Active' : 'Mark Completed'}
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderColor: '#ef4444', color: '#dc2626' }}
                  onClick={() => handleDelete(r.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RemindersPage;
