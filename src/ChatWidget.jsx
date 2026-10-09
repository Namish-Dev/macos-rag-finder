import { useState, useEffect } from 'react';
import { MessageCircle, X, Send, PanelRightOpen, PanelRightClose, History, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { apiFetch } from './api';

// const API_BASE = 'http://127.0.0.1:8000';

export default function ChatWidget({ folderId, token }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState('floating'); // 'floating' | 'sidebar'
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessionList, setShowSessionList] = useState(false);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Get (or create) a session for this folder, then load its messages.
  const initSession = async () => {
  const sessionsRes = await apiFetch(token, `/folders/${folderId}/sessions`);
  let sessionList = await sessionsRes.json();

  if (sessionList.length === 0) {
    await apiFetch(token, `/folders/${folderId}/sessions`, { method: 'POST' });
    const refetched = await apiFetch(token, `/folders/${folderId}/sessions`);
    sessionList = await refetched.json();
  }

  setSessions(sessionList);

  const oldest = sessionList[sessionList.length - 1];
  setSessionId(oldest.id);
  fetchMessages(oldest.id);
};

const fetchSessions = () => {
  apiFetch(token, `/folders/${folderId}/sessions`)
    .then((res) => res.json())
    .then((data) => setSessions(data));
};

const fetchMessages = (id) => {
  apiFetch(token, `/sessions/${id}/messages`)
    .then((res) => res.json())
    .then((data) => setMessages(data));
};

  const handleSelectSession = (id) => {
    setSessionId(id);
    fetchMessages(id);
    setShowSessionList(false);
  };

  const toggleSessionList = () => {
    if (!showSessionList) fetchSessions(); // refresh before showing — avoid a stale list
    setShowSessionList(!showSessionList);
  };

  // Creates an empty chat, makes it active, and returns to the message view.
const handleNewChat = async () => {
  const res = await apiFetch(token, `/folders/${folderId}/sessions`, { method: 'POST' });
  const created = await res.json();

  fetchSessions();
  setSessionId(created.id);
  setMessages([]);
  setShowSessionList(false);
};

const handleDeleteSession = async (e, id) => {
  e.stopPropagation();
  if (!window.confirm('Delete this chat and all its messages?')) return;

  await apiFetch(token, `/sessions/${id}`, { method: 'DELETE' });

  const listRes = await apiFetch(token, `/folders/${folderId}/sessions`);
  let remaining = await listRes.json();

  if (remaining.length === 0) {
    const createRes = await apiFetch(token, `/folders/${folderId}/sessions`, { method: 'POST' });
    const created = await createRes.json();

    const refetched = await apiFetch(token, `/folders/${folderId}/sessions`);
    remaining = await refetched.json();

    setSessions(remaining);
    setSessionId(created.id);
    setMessages([]);
    return;
  }

  setSessions(remaining);

  if (id === sessionId) {
    setSessionId(remaining[0].id);
    fetchMessages(remaining[0].id);
  }
};

  // Whenever the widget is opened, or the folder changes, (re)load the session.
  useEffect(() => {
    if (isOpen) {
      initSession();
      setShowSessionList(false);
    }
  }, [isOpen, folderId]);

  const handleSend = async () => {
  const userQuestion = question.trim();
  if (!userQuestion || !sessionId || isSending) return;

  setQuestion('');
  setIsSending(true);

  setMessages((prev) => [...prev, { role: 'user', content: userQuestion }]);

  try {
    await apiFetch(token, '/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_id: folderId,
        session_id: sessionId,
        question: userQuestion,
      }),
    });

    fetchMessages(sessionId);
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

  const panelStyle = viewMode === 'sidebar'
    ? {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        backgroundColor: '#ffffff',
        boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.15)',
        borderLeft: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 999,
        overflow: 'hidden',
      }
    : {
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
        <div style={panelStyle}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Chat about this folder</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={toggleSessionList}
                title="Chat history"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', padding: '4px' }}
              >
                <History size={16} />
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'floating' ? 'sidebar' : 'floating')}
                title={viewMode === 'floating' ? 'Switch to sidebar' : 'Switch to floating'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', padding: '4px' }}
              >
                {viewMode === 'floating' ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {showSessionList ? (
  <>
    <button
      onClick={handleNewChat}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '8px',
        borderRadius: '8px',
        border: '1px dashed #007aff',
        background: 'none',
        color: '#007aff',
        cursor: 'pointer',
        fontSize: '13px',
      }}
    >
      <Plus size={14} /> New Chat
    </button>

    {sessions.map((s) => (
      <div
        key={s.id}
        onClick={() => handleSelectSession(s.id)}
        style={{
          cursor: 'pointer',
          padding: '8px 10px',
          borderRadius: '8px',
          backgroundColor: s.id === sessionId ? '#e8f0fe' : 'transparent',
          border: '1px solid #e5e5e5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: s.id === sessionId ? 600 : 400 }}>
            {s.title}
          </div>
          <div style={{ fontSize: '11px', color: '#999' }}>
            {s.created_at?.slice(0, 16)}
          </div>
        </div>
        <button
          onClick={(e) => handleDeleteSession(e, s.id)}
          title="Delete chat"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', display: 'flex', padding: '4px' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    ))}
  </>
) : (
              <>
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
              </>
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