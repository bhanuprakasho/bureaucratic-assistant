import React, { useState, useEffect } from 'react';
import { fetchAllServices } from '../services/api';
import { BookOpen, FileCheck, ListOrdered, AlertCircle, Loader } from 'lucide-react';

const Services = () => {
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoading(true);
        const data = await fetchAllServices();
        if (data.success && data.data.length > 0) {
          setServices(data.data);
          setSelectedServiceId(data.data[0].id);
          setSelectedService(data.data[0]);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch government services from backend API.');
      } finally {
        setLoading(false);
      }
    };

    loadServices();
  }, []);

  const handleSelectChange = (e) => {
    const serviceId = e.target.value;
    setSelectedServiceId(serviceId);
    const found = services.find(s => s.id === serviceId);
    setSelectedService(found || null);
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader className="spin" size={32} color="var(--primary)" />
        <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading government services from backend knowledge base...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ borderLeft: '4px solid var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
        <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Make sure the backend server is running on http://localhost:5000</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Government Service Information Assistant</h1>
        <p className="page-subtitle">
          Select a official service to view eligibility requirements, document checklist, and step-by-step procedures.
        </p>
      </div>

      {/* Service Selector Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="service-select">
            Select Government Service / Scheme:
          </label>
          <select
            id="service-select"
            className="form-select"
            value={selectedServiceId}
            onChange={handleSelectChange}
            style={{ fontSize: '1rem', padding: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}
          >
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} ({service.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Detailed Service Display */}
      {selectedService && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header Banner */}
          <div className="card" style={{ background: 'var(--primary-light)', borderLeft: '5px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>{selectedService.name}</h2>
              <span className="badge badge-info">{selectedService.category}</span>
            </div>
            <p style={{ fontSize: '0.95rem', color: '#334155' }}>{selectedService.description}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Basic Eligibility */}
            <div className="card">
              <h3 className="card-title">
                <BookOpen size={20} /> Basic Eligibility Criteria
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                {selectedService.eligibility}
              </p>
            </div>

            {/* Required Documents */}
            <div className="card">
              <h3 className="card-title">
                <FileCheck size={20} /> Mandatory Documents
              </h3>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                {selectedService.requiredDocuments.map((doc, i) => (
                  <li key={i} style={{ marginBottom: '0.35rem' }}>{doc}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Application Steps */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>
              <ListOrdered size={20} /> Step-by-Step Application Guide
            </h3>
            <ol style={{ paddingLeft: '1.5rem', lineHeight: 1.7, fontSize: '0.92rem' }}>
              {selectedService.steps.map((step, idx) => (
                <li key={idx} style={{ marginBottom: '0.6rem' }}>
                  <strong>Step {idx + 1}:</strong> {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Important Information */}
          {selectedService.importantNotes && (
            <div className="card" style={{ backgroundColor: '#fffbeb', border: '1px solid #fef3c7' }}>
              <h3 className="card-title" style={{ color: 'var(--warning)', fontSize: '1rem' }}>
                <AlertCircle size={18} /> Important Information & Guidelines
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#92400e' }}>
                {selectedService.importantNotes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Services;
