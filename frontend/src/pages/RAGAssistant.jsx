
import React from 'react';

const RAGAssistant = () => {
  const streamlitUrl =
    import.meta.env.VITE_RAG_ASSISTANT_URL ||
    'http://localhost:8501/?embed=true';

  return (
    <div style={{ padding: '1rem' }}>
      <div className="page-header">
        <h1 className="page-title">
          Government Services RAG Assistant
        </h1>
        <p>
          Ask questions about government services and
          get answers grounded in official documents.
        </p>
      </div>

      <div
        style={{
          width: '100%',
          height: '80vh',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <iframe
          src={streamlitUrl}
          title="Government Services RAG Assistant"
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          allow="clipboard-read; clipboard-write"
        />
      </div>

      <p style={{ marginTop: '1rem' }}>
        If the assistant does not load,{' '}
        <a
          href={streamlitUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          open it in a separate tab
        </a>.
      </p>
    </div>
  );
};

export default RAGAssistant;
