// ============================================================
//  FILE: frontend/src/pages/Chat.js
//  PAGE: AI Chat Assistant  (http://localhost:3000/chat)
//
//  FEATURES IN THIS FILE:
//  ─────────────────────────────────────────────────────────
//  1. CONVERSATION HISTORY    line ~165  – sidebar list of past sessions
//  2. WELCOME SCREEN          line ~195  – suggestion chips, drag-drop hint
//  3. MESSAGE BUBBLES         line ~215  – user right / AI left, timestamps
//  4. COPY BUTTON             line ~230  – hover to copy any AI message
//  5. FILE UPLOAD             line ~70   – PDF → pdf2json, Word → mammoth, images
//  6. DRAG-AND-DROP UPLOAD    line ~40   – drop file anywhere on the page
//  7. AUTO-RESIZE TEXTAREA    line ~88   – grows as you type, caps at 130px
//  8. TYPING INDICATOR        line ~245  – animated dots while Groq responds
//
//  KEY FUNCTIONS:
//  ─────────────────────────────────────────────────────────
//  fetchConversations()       line ~50   – GET /api/chat/conversations
//  startNewConversation()     line ~56   – POST /api/chat/conversations
//  loadConversation()         line ~62   – loads messages from a past session
//  deleteConversation()       line ~67   – DELETE /api/chat/conversations/:id
//  processFile()              line ~75   – POST /api/chat/upload (PDF/Word/image)
//  handleDrop()               line ~88   – drag-and-drop handler
//  sendMessage()              line ~100  – POST /api/chat/conversations/:id/message
//  copyMessage()              line ~130  – copies AI response to clipboard
//
//  MODEL: Groq LLaMA 3.3 70B (configured in backend/routes/chat.js)
//  The AI system prompt injects the student's real academic data on every call.
//  Conversation history is sent in full to maintain context across messages.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './Chat.css';

const API = 'http://localhost:5000/api/chat';

const SUGGESTIONS = [
  { icon: '📊', text: 'Analyze my academic risk level' },
  { icon: '📅', text: 'What assignments are due soon?' },
  { icon: '📈', text: 'How can I improve my GPA?' },
  { icon: '📚', text: 'Create a study plan for this week' },
  { icon: '🎯', text: 'What grade do I need to pass?' },
  { icon: '💡', text: 'Tips based on my learning style' },
];

const NAV = [
  { href: '/dashboard', label: 'Dashboard',    icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { href: '/chat',      label: 'AI Assistant', icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
  { href: '/courses',   label: 'Courses',      icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg> },
  { href: '/grades',    label: 'Grades',       icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
];

function Chat() {
  const [conversations, setConversations]           = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages]                     = useState([]);
  const [input, setInput]                           = useState('');
  const [loading, setLoading]                       = useState(false);
  const [loadingConvs, setLoadingConvs]             = useState(true);
  const [uploadedFile, setUploadedFile]             = useState(null);
  const [fileContext, setFileContext]               = useState('');
  const [uploading, setUploading]                   = useState(false);
  const [copiedIdx, setCopiedIdx]                   = useState(null);
  const [dragOver, setDragOver]                     = useState(false);
  const [darkMode, setDarkMode]                     = useState(() => localStorage.getItem('acadai-theme') !== 'light');

  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);
  const textareaRef    = useRef(null);
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  const headers = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }), []);

  useEffect(() => { fetchConversations(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('acadai-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API}/conversations`, { headers: headers() });
      setConversations(res.data);
    } catch (err) { console.error(err); }
    finally { setLoadingConvs(false); }
  };

  const startNewConversation = async () => {
    try {
      const res = await axios.post(`${API}/conversations`, {}, { headers: headers() });
      setActiveConversation(res.data);
      setMessages([]);
      setConversations(prev => [res.data, ...prev]);
      setUploadedFile(null); setFileContext('');
    } catch (err) { console.error(err); }
  };

  const loadConversation = (conv) => {
    setActiveConversation(conv);
    setMessages(conv.messages.map(m => ({ role: m.role, text: m.text, ts: m.createdAt })));
    setUploadedFile(null); setFileContext('');
  };

  const deleteConversation = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/conversations/${id}`, { headers: headers() });
      setConversations(prev => prev.filter(c => c._id !== id));
      if (activeConversation?._id === id) { setActiveConversation(null); setMessages([]); }
    } catch (err) { console.error(err); }
  };

  const processFile = async (file) => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/upload`, formData, {
        headers: { ...headers(), 'Content-Type': 'multipart/form-data' }
      });
      setUploadedFile({ name: res.data.fileName, type: res.data.fileType });
      setFileContext(res.data.extractedText);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `I've received **${res.data.fileName}**. What would you like to know about it?`,
        ts: new Date().toISOString(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Sorry, I could not process that file. Please try again.',
        ts: new Date().toISOString(),
      }]);
    } finally { setUploading(false); }
  };

  const handleFileChange = (e) => { processFile(e.target.files[0]); e.target.value = ''; };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; }
  };

  const sendMessage = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text) return;

    let convId = activeConversation?._id;
    if (!convId) {
      try {
        const res = await axios.post(`${API}/conversations`, {}, { headers: headers() });
        setActiveConversation(res.data);
        setConversations(prev => [res.data, ...prev]);
        convId = res.data._id;
      } catch { return; }
    }

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', text, ts: new Date().toISOString() }]);
    setLoading(true);

    try {
      const res = await axios.post(
        `${API}/conversations/${convId}/message`,
        { message: text, fileContext: fileContext || null, fileName: uploadedFile?.name || null },
        { headers: headers() }
      );
      setMessages(prev => [...prev, {
        role: 'assistant', text: res.data.response, ts: new Date().toISOString()
      }]);
      if (res.data.title) {
        setConversations(prev => prev.map(c => c._id === convId ? { ...c, title: res.data.title } : c));
        setActiveConversation(prev => ({ ...prev, title: res.data.title }));
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', text: 'Sorry, I encountered an error. Please try again.',
        ts: new Date().toISOString()
      }]);
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const copyMessage = async (text, idx) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    const d = new Date(date), now = new Date();
    const days = Math.floor((now - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7)  return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const msgCount = messages.filter(m => m.role === 'user').length;
  const isWelcome = !activeConversation && messages.length === 0;

  return (
    <div
      className="chat-root"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-inner">
            <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Drop your file here
          </div>
        </div>
      )}

      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="chat-sidebar">
        <div className="chat-sb-top">
          <div className="chat-sb-logo">Acad<span>AI</span></div>
          <div className="chat-sb-profile">
            <div className="chat-sb-avatar">{user?.name?.charAt(0)}</div>
            <div>
              <div className="chat-sb-name">{user?.name}</div>
              <div className="chat-sb-role">Student</div>
            </div>
          </div>
          <nav className="chat-sb-nav">
            <div className="sb-nav-label">Main Menu</div>
            {NAV.map(n => (
              <a key={n.href} href={n.href}
                className={`chat-sb-link${n.href === '/chat' ? ' active' : ''}`}>
                {n.icon}{n.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="chat-conv-section">
          <div className="chat-conv-header">
            <span className="chat-conv-label">Recent Chats</span>
            <button className="new-chat-btn" onClick={startNewConversation}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New
            </button>
          </div>

          <div className="conversations-list">
            {loadingConvs ? (
              <div className="conv-empty">
                <div className="loader-sm" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="conv-empty">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--text3)', marginBottom: 8 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <p>No conversations yet</p>
                <span>Start chatting below</span>
              </div>
            ) : conversations.map(conv => (
              <div
                key={conv._id}
                className={`conv-item${activeConversation?._id === conv._id ? ' active' : ''}`}
                onClick={() => loadConversation(conv)}
              >
                <div className="conv-icon">
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </div>
                <div className="conv-info">
                  <div className="conv-title">{conv.title}</div>
                  <div className="conv-date">{formatDate(conv.updatedAt)}</div>
                </div>
                <button className="conv-delete" onClick={e => deleteConversation(e, conv._id)} title="Delete">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-sb-footer">
          <button className="theme-btn" onClick={() => setDarkMode(d => !d)}>
            {darkMode
              ? <><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light Mode</>
              : <><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> Dark Mode</>
            }
          </button>
          <button className="logout-btn" onClick={() => {
            localStorage.removeItem('token'); localStorage.removeItem('user');
            window.location.href = '/login';
          }}>Sign Out</button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="chat-main">

        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-avatar">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </div>
            <div>
              <h2 className="chat-header-title">
                {activeConversation?.title || 'AcadAI Assistant'}
              </h2>
              <div className="chat-header-meta">
                <span className="online-dot" />
                <span className="online-label">Online</span>
                <span className="header-sep">·</span>
                <span className="model-badge">LLaMA 3.3 70B</span>
                {msgCount > 0 && (
                  <><span className="header-sep">·</span>
                  <span className="msg-count">{msgCount} message{msgCount !== 1 ? 's' : ''}</span></>
                )}
              </div>
            </div>
          </div>
          {activeConversation && (
            <button className="new-chat-header-btn" onClick={startNewConversation} title="New conversation">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Chat
            </button>
          )}
        </header>

        {/* Messages */}
        <div className="messages-container">
          {isWelcome ? (
            <div className="welcome-screen">
              <div className="welcome-glow" />
              <div className="welcome-icon">
                <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <h2>How can I help you today?</h2>
              <p>Ask me anything about your academics — deadlines, grades, risk level, or study strategies. You can also upload files (PDF, Word, images) to get instant analysis.</p>
              <div className="suggestions-grid">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="suggestion-btn" onClick={() => sendMessage(s.text)}>
                    <span className="suggestion-icon">{s.icon}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
              <p className="welcome-hint">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Drag &amp; drop a file anywhere to upload
              </p>
            </div>
          ) : (
            <>
              <div className="messages-spacer" />
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="msg-avatar assistant-avatar">
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    </div>
                  )}
                  <div className="msg-content">
                    <div className={`message-bubble ${msg.role}`}>
                      {msg.role === 'assistant'
                        ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                        : <p>{msg.text}</p>
                      }
                    </div>
                    <div className="msg-footer">
                      {msg.ts && <span className="msg-time">{formatTime(msg.ts)}</span>}
                      {msg.role === 'assistant' && (
                        <button
                          className="copy-btn"
                          onClick={() => copyMessage(msg.text, i)}
                          title="Copy"
                        >
                          {copiedIdx === i
                            ? <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Copied</>
                            : <><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="msg-avatar user-avatar">{user?.name?.charAt(0)}</div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="message assistant">
                  <div className="msg-avatar assistant-avatar">
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  </div>
                  <div className="msg-content">
                    <div className="message-bubble assistant typing">
                      <span /><span /><span />
                    </div>
                    <div className="msg-footer">
                      <span className="msg-time">Generating…</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          {uploadedFile && (
            <div className="file-preview">
              <div className="file-preview-left">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>{uploadedFile.name}</span>
              </div>
              <button className="file-remove-btn" onClick={() => { setUploadedFile(null); setFileContext(''); }} title="Remove">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

          <div className="input-row">
            <input type="file" ref={fileInputRef} onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" style={{ display: 'none' }} />

            <button
              className="icon-btn upload-btn"
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              title="Upload file (PDF, Word, image)"
            >
              {uploading
                ? <div className="loader-sm" />
                : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              }
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your academics…"
              rows={1}
            />

            <button
              className="icon-btn send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              title="Send (Enter)"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>

          <p className="input-hint">
            <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for new line &nbsp;·&nbsp; drag files to upload
          </p>
        </div>
      </main>
    </div>
  );
}

export default Chat;
