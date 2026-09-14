import ReactMarkdown from 'react-markdown';
import { ArrowLeft } from 'lucide-react';
import remarkGfm from 'remark-gfm';

export default function FilePreviewPage({ file, onBack }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 16px',
        borderBottom: '1px solid #e5e5e5',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: '#1d1d1f', padding: '4px' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>{file.name}</span>
      </div>

      <div className="file-preview-content" style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content || 'No content available.'}</ReactMarkdown>
      </div>
    </div>
  );
}