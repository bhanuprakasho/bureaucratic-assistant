import React from 'react';
import { Clock, Lock } from 'lucide-react';

const upcomingItems = [
  { title: "Advanced RAG & Vector Search", desc: "Semantic retrieval over full government gazettes & policy PDFs using vector embeddings." },
  { title: "Personalized Scholarship Statement Generator", desc: "Automated AI drafting of SOPs and income rationale letters for scholarship applications." },
  { title: "Automatic Renewal & Expiry Reminders", desc: "Automated SMS/Email alerts prior to Driving Licence, Passport, or Scheme renewals." },
  { title: "Advanced Scam Detection", desc: "Deep learning model for multi-language scam message analysis and phishing link domain lookup." },
  { title: "Expanded Government Schemes Database", desc: "Real-time sync of state and central welfare schemes across all Indian ministries." },
  { title: "Advanced Document Tamper Verification", desc: "Digital forensic inspection for modified photos, forged stamps, and altered text." },
  { title: "User Accounts & Secure Document Vault", desc: "Encrypted citizen profile storage with multi-factor authentication (MFA)." },
  { title: "Live Government API Integration", desc: "Direct Digilocker & UIDAI sandbox authentication for live document pull." },
  { title: "Official Verification Workflow", desc: "Government officer portal for reviewing citizen submissions and scheduling appointments." }
];

const UpcomingFeatures = () => {
  return (
    <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px dashed var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Clock size={24} color="var(--primary)" />
        <h2 style={{ fontSize: '1.4rem', color: 'var(--primary)', fontWeight: 700 }}>
          Upcoming Features (Remaining 60% Milestone)
        </h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        The following modules represent future expansion capabilities planned for subsequent releases.
      </p>

      <div className="card-grid">
        {upcomingItems.map((item, index) => (
          <div key={index} className="card" style={{ background: '#f8fafc', opacity: 0.85, borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                {item.title}
              </h3>
              <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem' }}>
                <Lock size={10} /> Planned
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UpcomingFeatures;
