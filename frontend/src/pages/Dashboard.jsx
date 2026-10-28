import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen, FileSearch, CheckCircle, ListChecks, ShieldAlert,
  FileText, Bell, FileEdit, UserCheck, ArrowRight, ShieldCheck, Cpu
} from 'lucide-react';

const Dashboard = () => {
  const { user, isAuthenticated } = useAuth();

  const coreModules = [
    {
      title: "Government Service Directory",
      desc: "Explore verified official requirements, eligibility criteria, required documents, and step-by-step procedures for Aadhaar, PAN, Passport, Driving Licence, and Schemes.",
      link: "/services",
      icon: <BookOpen size={28} color="var(--primary)" />,
      badge: "Knowledge Base"
    },
    {
      title: "Private Document Vault & OCR",
      desc: "Upload identity documents, PDFs, or images for automated Tesseract OCR text extraction, field detection, and private server-isolated storage.",
      link: "/upload",
      icon: <FileSearch size={28} color="var(--primary)" />,
      badge: "OCR & Storage"
    },
    {
      title: "Scheme Eligibility Checker",
      desc: "Evaluate your age, annual income, student status, and social category against deterministic backend rules to verify preliminary scheme eligibility.",
      link: "/eligibility",
      icon: <CheckCircle size={28} color="var(--primary)" />,
      badge: "Rule Engine"
    },
    {
      title: "Persistent Document Checklist",
      desc: "Generate interactive document preparation checklists saved to your SQLite profile. Track gathered items before visiting official enrollment centers.",
      link: "/checklist",
      icon: <ListChecks size={28} color="var(--primary)" />,
      badge: "Checklists"
    },
    {
      title: "ML Scam & Phishing Screener",
      desc: "Screen suspicious SMS notices and links using our trained Logistic Regression TF-IDF model combined with official .gov.in domain integrity indicators.",
      link: "/scam-verify",
      icon: <ShieldAlert size={28} color="var(--danger)" />,
      badge: "ML Inference"
    },
    {
      title: "Immigration & Screening Workstation",
      desc: "End-to-end identity verification: link multiple documents, detect cross-document name/DOB discrepancies, check expirations, and record reviewer conclusions.",
      link: "/immigration",
      icon: <UserCheck size={28} color="#2563eb" />,
      badge: "Reviewer Portal"
    },
    {
      title: "Knowledge Base & Grounded Assistant",
      desc: "Search verified government regulations and query the grounded QA assistant. All answers cite official source portals without hallucination.",
      link: "/knowledge",
      icon: <Cpu size={28} color="#0891b2" />,
      badge: "Grounded QA"
    },
    {
      title: "Application Drafts & Statement Generator",
      desc: "Autofill application forms from your verified OCR documents, save draft progress in database, and generate personalized Statements of Purpose (SOPs).",
      link: "/drafts",
      icon: <FileEdit size={28} color="#7c3aed" />,
      badge: "Form Drafter"
    },
    {
      title: "Renewal & Expiry Reminders",
      desc: "Automated schedule tracking for passport renewals, driving licence expirations, and scheme deadlines with background notification checks.",
      link: "/reminders",
      icon: <Bell size={28} color="#ea580c" />,
      badge: "Background Jobs"
    }
  ];

  return (
    <div>
      {/* System Status Banner */}
      <div className="disclaimer-banner" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
        <ShieldCheck size={20} color="#16a34a" />
        <span>
          <strong>Fully Integrated CSE Production Prototype:</strong> All 9 core subsystems are operational with SQLite persistence, bcrypt/JWT role authentication, and trained machine learning pipelines.
        </span>
      </div>

      {/* Hero Header */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Intelligent Bureaucratic Assistance and Verification System</h1>
        <p className="page-subtitle">
          An integrated citizen platform designed to eliminate bureaucratic confusion, guide document preparation, cross-verify identity dossiers, and screen fraudulent notices.
        </p>
      </div>

      {/* User Status Card */}
      {isAuthenticated ? (
        <div className="card" style={{ backgroundColor: 'var(--primary-light)', borderLeft: '4px solid var(--primary)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                Welcome, {user.full_name}
              </div>
              <p style={{ fontSize: '0.875rem', color: '#334155', margin: '0.2rem 0 0' }}>
                Signed in as <strong>{user.username}</strong> ({user.email}). Account Role: <span className="badge badge-info">{user.role.toUpperCase()}</span>
              </p>
            </div>
            {['reviewer', 'admin'].includes(user.role) && (
              <Link to="/immigration" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                Open Reviewer Workstation
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#b45309' }}>
                Evaluation Notice: You are currently browsing as a guest
              </div>
              <p style={{ fontSize: '0.85rem', color: '#78350f', margin: '0.2rem 0 0' }}>
                Sign in to save private application drafts, view personal document vaults, and access reviewer screening capabilities.
              </p>
            </div>
            <Link to="/login" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              Sign In (Demo Accounts Available)
            </Link>
          </div>
        </div>
      )}

      {/* Core Subsystem Grid */}
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
        System Subsystems & Modules (100% Integrated)
      </h2>

      <div className="card-grid">
        {coreModules.map((card, idx) => (
          <Link
            key={idx}
            to={card.link}
            className="card card-interactive"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textDecoration: 'none' }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                {card.icon}
                <span className="badge badge-info">{card.badge}</span>
              </div>
              <h3 className="card-title">{card.title}</h3>
              <p className="card-desc">{card.desc}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem', marginTop: '1rem' }}>
              Launch Subsystem <ArrowRight size={16} />
            </div>
          </Link>
        ))}
      </div>

      {/* Architecture & Evaluation Guide Summary */}
      <div className="card" style={{ marginTop: '2.5rem', background: '#f8fafc', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
          Demonstration Workflows (Viva & Examination Ready)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
          <div style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)' }}>Workflow A — Scholarship Assistance:</strong>
            <p style={{ margin: '0.25rem 0 0' }}>Review Post-Matric requirements → check eligibility → generate checklist → upload supporting marksheet/ID → auto-fill draft → save & reopen.</p>
          </div>
          <div style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)' }}>Workflow B — Scam Screening:</strong>
            <p style={{ margin: '0.25rem 0 0' }}>Submit electricity or tax refund lure → execute Python TF-IDF Logistic Regression model → inspect probability & rule triggers → save report.</p>
          </div>
          <div style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)' }}>Workflow C — Immigration Verification:</strong>
            <p style={{ margin: '0.25rem 0 0' }}>Create case → link synthetic passport and Aadhaar → inspect name/DOB mismatch flags → sign in as reviewer → record official decision.</p>
          </div>
          <div style={{ background: 'white', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)' }}>Workflow D — Reminders & Administration:</strong>
            <p style={{ margin: '0.25rem 0 0' }}>Schedule renewal reminder → background worker checks due dates → sign in as admin → publish new official gazette article.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
