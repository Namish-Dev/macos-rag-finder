import { useState, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';


const API_BASE = 'http://127.0.0.1:8000';

export default function ChatWidget({ folderId, token }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Get (or create) a session for this folder, then load its messages.
  const initSession = async () => {
    const sessionsRes = await fetch(`${API_BASE}/folders/${folderId}/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let sessions = await sessionsRes.json();

    let activeId;
    if (sessions.length === 0) {
      const createRes = await fetch(`${API_BASE}/folders/${folderId}/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const created = await createRes.json();
      activeId = created.id;
    } else {
      activeId = sessions[0].id;
    }

    setSessionId(activeId);
    fetchMessages(activeId);
  };

  const fetchMessages = (id) => {
    fetch(`${API_BASE}/sessions/${id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setMessages(data));
  };

  // Whenever the widget is opened, or the folder changes, (re)load the session.
  useEffect(() => {
    if (isOpen) {
      initSession();
    }
  }, [isOpen, folderId]);

  const handleSend = async () => {
  const userQuestion = question.trim();
  if (!userQuestion || !sessionId || isSending) return;

  setQuestion('');
  setIsSending(true);

  // Show the question right away — don't wait for the backend round trip.
  setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);

  try {
    await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        folder_id: folderId,
        session_id: sessionId,
        question: userQuestion,
      }),
    });

    fetchMessages(sessionId); // replaces with the real, saved list
  } catch (err) {
    console.error('Ask failed:', err);
  } finally {
    setIsSending(false);
  }
};

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Chat about this folder"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#007aff',
          color: '#ffffff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          zIndex: 1000,
        }}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '24px',
            width: '340px',
            height: '460px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            border: '1px solid #e5e5e5',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 999,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', fontWeight: 600, fontSize: '14px', flexShrink: 0 }}>
            Chat about this folder
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ color: '#999', fontSize: '13px' }}>
                Ask a question about the notes in this folder.
              </div>
            )}
            {messages.map((msg, i) => (
  <div
    key={i}
    className="chat-message-content"
    style={{
      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
      backgroundColor: msg.role === 'user' ? '#007aff' : '#f0f0f0',
      color: msg.role === 'user' ? '#ffffff' : '#1d1d1f',
      padding: '8px 12px',
      borderRadius: '12px',
      maxWidth: '85%',
      fontSize: '13px',
      
    }}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
      {msg.content}
    </ReactMarkdown>
  </div>
))}
            {isSending && (
              <div style={{ alignSelf: 'flex-start', color: '#999', fontSize: '13px' }}>
                Thinking…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', borderTop: '1px solid #e5e5e5', flexShrink: 0 }}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                padding: '10px 12px',
                fontSize: '13px',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={isSending}
              style={{
                border: 'none',
                background: 'none',
                padding: '0 14px',
                cursor: isSending ? 'default' : 'pointer',
                color: '#007aff',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}