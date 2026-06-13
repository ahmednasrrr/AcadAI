// ============================================================
//  FILE: frontend/src/pages/Faculty.js
//  PAGE: Faculty Portal  (http://localhost:3000/faculty)
//  LOGIN: nermin@acadai.com / faculty123
//
//  TABS & FEATURES:
//  ─────────────────────────────────────────────────────────
//  TAB 1 – STUDENTS           line ~315  – overview table with ML risk badges
//    └─ Risk distribution chart (Recharts PieChart + BarChart)
//    └─ Per-student GPA, risk level, cluster profile
//
//  TAB 2 – AI ANALYST         line ~365  – plain-English Q&A over student data
//    └─ askAnalyst()           line ~115  – POST /api/faculty/analyst
//    └─ Auto-generated charts  line ~385  – Recharts bar/pie from Groq JSON
//    └─ Highlight stat cards   line ~378  – key numbers above each answer
//    └─ Suggested questions    line ~108  – ANALYST_SUGGESTIONS constant
//
//  TAB 3 – ASSESSMENT GEN     line ~430  – AI quiz/exam generator
//    └─ handleAsmtUpload()     line ~130  – POST /api/chat/upload (file extraction)
//    └─ generateAssessment()   line ~142  – POST /api/faculty/generate-assessment
//    └─ exportAssessment()     line ~155  – downloads .txt with question + answer key
//    └─ toggleType()           line ~125  – MCQ / True-False / Short / Essay toggle
//
//  TAB 4 – ADD COURSE         line ~500  – adds course to catalog + auto-enrolls
//  TAB 5 – ANNOUNCEMENTS      line ~530  – POST /api/faculty/announcement
//  TAB 6 – UPDATE GRADES      line ~555  – PUT /api/faculty/grade
//
//  KEY FUNCTIONS:
//  ─────────────────────────────────────────────────────────
//  fetchDashboard()           line ~36   – GET /api/faculty/dashboard
//  handleAddCourse()          line ~46   – POST /api/faculty/course
//  handleAddAnnouncement()    line ~53   – POST /api/faculty/announcement
//  handleUpdateGrade()        line ~63   – PUT /api/faculty/grade
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './Faculty.css';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

const API = 'http://localhost:5000/api';

function Faculty() {
  const [students, setStudents]   = useState([]);
  const [courses, setCourses]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('students');
  const [darkMode, setDarkMode]   = useState(() => localStorage.getItem('acadai-theme') !== 'light');
  const [successMessage, setSuccessMessage] = useState('');

  const [newCourse, setNewCourse]             = useState({ name: '', code: '', instructor: '', credits: 3 });
  const [newAnnouncement, setNewAnnouncement] = useState({ courseId: '', title: '', body: '' });
  const [newGrade, setNewGrade]               = useState({ studentId: '', courseId: '', grade: '', letterGrade: '' });

  // ── AI Analyst state ──
  const [analystMsgs, setAnalystMsgs]   = useState([]);
  const [analystInput, setAnalystInput] = useState('');
  const [analystLoading, setAnalystLoading] = useState(false);
  const analystEndRef = useRef(null);

  // ── Assessment Generator state ──
  const [asmtConfig, setAsmtConfig] = useState({
    topic: '', courseName: '', numQuestions: 5, difficulty: 'Medium',
    types: ['mcq'],
  });
  const [asmtMaterial, setAsmtMaterial] = useState('');
  const [asmtFileName, setAsmtFileName] = useState('');
  const [asmtUploading, setAsmtUploading] = useState(false);
  const [asmtResult, setAsmtResult]     = useState(null);
  const [asmtLoading, setAsmtLoading]   = useState(false);
  const [showAnswers, setShowAnswers]   = useState(true);
  const [asmtError, setAsmtError]       = useState('');
  const asmtFileRef = useRef(null);

  useEffect(() => { fetchDashboard(); }, []);

  useEffect(() => { analystEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [analystMsgs, analystLoading]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('acadai-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/faculty/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(res.data.students);
      setCourses(res.data.courses);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const showSuccess = (msg) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(''), 3000); };

  const handleAddCourse = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/faculty/course', newCourse, { headers: { Authorization: `Bearer ${token}` } });
      showSuccess('Course added successfully!');
      setNewCourse({ name: '', code: '', instructor: '', credits: 3 });
      fetchDashboard();
    } catch (err) { console.error(err); }
  };

  const handleAddAnnouncement = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/faculty/announcement', newAnnouncement, { headers: { Authorization: `Bearer ${token}` } });
      showSuccess('Announcement posted successfully!');
      setNewAnnouncement({ courseId: '', title: '', body: '' });
      fetchDashboard();
    } catch (err) { console.error(err); }
  };

  const handleUpdateGrade = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put('http://localhost:5000/api/faculty/grade', newGrade, { headers: { Authorization: `Bearer ${token}` } });
      showSuccess('Grade updated successfully!');
      setNewGrade({ studentId: '', courseId: '', grade: '', letterGrade: '' });
      fetchDashboard();
    } catch (err) { console.error(err); }
  };

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  // ── AI Analyst ──
  const ANALYST_SUGGESTIONS = [
    'Who are the highest-risk students right now?',
    'What is the average GPA across all students?',
    'Show the risk-level distribution as a chart',
    'Which students have missed the most assignments?',
  ];

  const askAnalyst = async (overrideText) => {
    const q = (overrideText || analystInput).trim();
    if (!q || analystLoading) return;
    setAnalystInput('');
    setAnalystMsgs(prev => [...prev, { role: 'user', text: q }]);
    setAnalystLoading(true);
    try {
      const res = await axios.post(`${API}/faculty/analyst`, { question: q }, { headers: authHeader() });
      setAnalystMsgs(prev => [...prev, {
        role: 'assistant',
        text: res.data.answer,
        chart: res.data.chart,
        highlights: res.data.highlights,
      }]);
    } catch {
      setAnalystMsgs(prev => [...prev, { role: 'assistant', text: 'Sorry, I could not analyze that. Please try again.' }]);
    } finally { setAnalystLoading(false); }
  };

  // ── Assessment Generator ──
  const toggleType = (t) => {
    setAsmtConfig(c => {
      const has = c.types.includes(t);
      const types = has ? c.types.filter(x => x !== t) : [...c.types, t];
      return { ...c, types: types.length ? types : c.types };
    });
  };

  const handleAsmtUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAsmtUploading(true);
    setAsmtError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(`${API}/chat/upload`, fd, {
        headers: { ...authHeader(), 'Content-Type': 'multipart/form-data' }
      });
      setAsmtMaterial(res.data.extractedText || '');
      setAsmtFileName(res.data.fileName || file.name);
    } catch {
      setAsmtError('Could not read that file. Try another, or paste a topic instead.');
    } finally { setAsmtUploading(false); e.target.value = ''; }
  };

  const generateAssessment = async () => {
    if (!asmtConfig.topic.trim() && !asmtMaterial.trim()) {
      setAsmtError('Enter a topic or upload course material first.');
      return;
    }
    setAsmtError('');
    setAsmtLoading(true);
    setAsmtResult(null);
    try {
      const res = await axios.post(`${API}/faculty/generate-assessment`, {
        ...asmtConfig, material: asmtMaterial,
      }, { headers: authHeader() });
      setAsmtResult(res.data);
      setShowAnswers(true);
    } catch (err) {
      setAsmtError(err.response?.data?.message || 'Generation failed. Please try again.');
    } finally { setAsmtLoading(false); }
  };

  const exportAssessment = () => {
    if (!asmtResult) return;
    let txt = `${asmtResult.title}\n${'='.repeat(asmtResult.title.length)}\n\n`;
    asmtResult.questions.forEach((q, i) => {
      txt += `${i + 1}. [${q.type.toUpperCase()} · ${q.difficulty} · Bloom: ${q.bloom}]\n${q.question}\n`;
      if (q.options) q.options.forEach(o => { txt += `   ${o}\n`; });
      txt += '\n';
    });
    txt += `\n\nANSWER KEY\n${'='.repeat(10)}\n\n`;
    asmtResult.questions.forEach((q, i) => {
      txt += `${i + 1}. ${q.answer}\n`;
      if (q.explanation) txt += `   → ${q.explanation}\n`;
      txt += '\n';
    });
    const blob = new Blob([txt], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${asmtResult.title.replace(/[^a-z0-9]+/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRiskCls = (risk) => risk === 'High' ? 'danger' : risk === 'Medium' ? 'warning' : 'success';

  const riskData = [
    { name: 'High Risk',   value: students.filter(s => s.riskLevel === 'High').length   },
    { name: 'Medium Risk', value: students.filter(s => s.riskLevel === 'Medium').length },
    { name: 'Low Risk',    value: students.filter(s => s.riskLevel === 'Low').length    },
  ];

  const gpaData = students.map(s => ({
    name: s.name.split(' ')[0],
    gpa:  s.gpa,
    risk: s.riskLevel,
  }));

  const RISK_COLORS = { High: '#f87171', Medium: '#fbbf24', Low: '#34d399' };
  const CHART_PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#fb923c'];
  const isDark = darkMode;
  const chartBg   = isDark ? '#1a2035' : '#ffffff';
  const chartBdr  = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const chartText = isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8';

  const TABS = [
    { id: 'students',      label: 'Students'      },
    { id: 'analyst',       label: 'AI Analyst'     },
    { id: 'assessment',    label: 'Assessment Generator' },
    { id: 'courses',       label: 'Add Course'     },
    { id: 'announcements', label: 'Announcements'  },
    { id: 'grades',        label: 'Update Grades'  },
  ];

  const TAB_TITLES = {
    students: 'Student Overview', analyst: 'AI Analyst', assessment: 'Assessment Generator',
    courses: 'Add New Course', announcements: 'Post Announcement', grades: 'Update Grades',
  };
  const TAB_SUBTITLES = {
    analyst: 'Ask questions about your students in plain English',
    assessment: 'Generate quizzes & exams from any topic or material',
  };

  if (loading) return <div className="loading-screen"><div className="loader" /><p>Loading faculty dashboard…</p></div>;

  return (
    <div className="pg-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sb-logo">Acad<span>AI</span></div>
        <div className="sb-role-badge">Faculty Portal</div>

        <nav className="sb-nav" style={{ marginTop: 20 }}>
          <div className="sb-nav-label">Navigation</div>
          {TABS.map(t => (
            <button key={t.id} className={`sb-tab ${activeTab === t.id ? 'sb-tab-active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="sb-footer">
          <button className="theme-btn" onClick={() => setDarkMode(d => !d)}>{darkMode ? '☀ Light Mode' : '☾ Dark Mode'}</button>
          <button className="logout-btn" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; }}>Sign Out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="pg-main">
        <div className="pg-header">
          <div>
            <h1 className="pg-title">{TAB_TITLES[activeTab]}</h1>
            <p className="pg-subtitle">{TAB_SUBTITLES[activeTab] || 'Faculty Management Portal'}</p>
          </div>
        </div>

        {successMessage && <div className="success-msg">{successMessage}</div>}

        {/* ── Students Tab ──────────────────────────────────── */}
        {activeTab === 'students' && (
          <>
            <div className="stats-row">
              {[
                { val: students.length,                                          lbl: 'Total Students', cls: '' },
                { val: students.filter(s => s.riskLevel === 'High').length,   lbl: 'High Risk',      cls: 'danger'  },
                { val: students.filter(s => s.riskLevel === 'Medium').length, lbl: 'Medium Risk',    cls: 'warning' },
                { val: students.filter(s => s.riskLevel === 'Low').length,    lbl: 'Low Risk',       cls: 'success' },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <div className="stat-label">{s.lbl}</div>
                  <div className={`stat-num ${s.cls}`}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Cluster profile summary — built from actual ML cluster names */}
            {(() => {
              const clusterMap = {};
              students.forEach(s => {
                const name  = s.clusterProfile?.cluster_name;
                const color = s.clusterProfile?.color || '#818cf8';
                if (!name) return;
                if (!clusterMap[name]) clusterMap[name] = { count: 0, color };
                clusterMap[name].count++;
              });
              const entries = Object.entries(clusterMap).sort((a, b) => b[1].count - a[1].count);
              if (entries.length === 0) return null;
              return (
                <div className="cluster-summary">
                  {entries.map(([name, { count, color }]) => (
                    <div key={name} className="cluster-sum-card">
                      <div className="cluster-sum-dot" style={{ background: color }} />
                      <div className="cluster-sum-name">{name}</div>
                      <div className="cluster-sum-count" style={{ color }}>{count}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="charts-row">
              <div className="chart-card">
                <div className="chart-title">
                  <span className="ml-pill">ML</span> Risk Distribution
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={riskData} cx="50%" cy="50%" outerRadius={85} dataKey="value"
                      label={({ name, value }) => value > 0 ? `${value}` : ''}>
                      {riskData.map((_, i) => (
                        <Cell key={i} fill={['#f87171','#fbbf24','#34d399'][i]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: chartBg, border: `1px solid ${chartBdr}`, borderRadius: 8, fontSize: 13 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: chartText }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <div className="chart-title">Student GPA Overview</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={gpaData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke={chartText} tick={{ fill: chartText, fontSize: 11 }} />
                    <YAxis domain={[0,4]} stroke={chartText} tick={{ fill: chartText, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: chartBg, border: `1px solid ${chartBdr}`, borderRadius: 8, fontSize: 13 }}
                      formatter={(v) => [`GPA: ${v}`, '']} />
                    <Bar dataKey="gpa" radius={[6,6,0,0]}>
                      {gpaData.map((s, i) => <Cell key={i} fill={RISK_COLORS[s.risk] || '#818cf8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="data-table">
              <div className="table-head">
                <span>Student</span><span>ID</span><span>GPA</span>
                <span>Risk</span><span>Profile</span><span>Missed</span>
              </div>
              {students.map((s, i) => (
                <div key={i} className="table-row">
                  <div className="student-cell">
                    <div className="student-av">{s.name.charAt(0)}</div>
                    <div>
                      <div className="student-name">{s.name}</div>
                      <div className="student-email">{s.email}</div>
                    </div>
                  </div>
                  <span className="td">{s.studentId}</span>
                  <span className="td">{s.gpa?.toFixed(1)}</span>
                  <span className="td">
                    <span className={`risk-chip ${getRiskCls(s.riskLevel)}`}>{s.riskLevel}</span>
                  </span>
                  <span className="td">
                    <span className="profile-chip" style={{
                      color: s.clusterProfile?.color || 'var(--text2)',
                      background: s.clusterProfile?.bg || 'var(--bg2)',
                    }}>
                      {s.clusterProfile?.cluster_name || '—'}
                    </span>
                  </span>
                  <span className="td">{s.engagement?.assignmentsMissed || 0}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── AI Analyst Tab ────────────────────────────────── */}
        {activeTab === 'analyst' && (
          <div className="analyst-wrap">
            <div className="analyst-chat">
              {analystMsgs.length === 0 && !analystLoading ? (
                <div className="analyst-welcome">
                  <div className="analyst-welcome-icon">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                  </div>
                  <h3>Ask anything about your students</h3>
                  <p>I analyze live data from all {students.length} student{students.length !== 1 ? 's' : ''} — GPA, ML risk levels, engagement, and grades — and answer in plain English with charts.</p>
                  <div className="analyst-suggestions">
                    {ANALYST_SUGGESTIONS.map((s, i) => (
                      <button key={i} className="analyst-sugg" onClick={() => askAnalyst(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="analyst-messages">
                  {analystMsgs.map((m, i) => (
                    <div key={i} className={`an-msg ${m.role}`}>
                      {m.role === 'assistant' && (
                        <div className="an-avatar"><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2a3 3 0 00-3 3v1a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></svg></div>
                      )}
                      <div className="an-bubble">
                        {m.role === 'assistant' ? (
                          <>
                            {m.highlights?.length > 0 && (
                              <div className="an-highlights">
                                {m.highlights.map((h, j) => (
                                  <div key={j} className="an-highlight">
                                    <div className="an-highlight-val">{h.value}</div>
                                    <div className="an-highlight-lbl">{h.label}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="an-markdown"><ReactMarkdown>{m.text}</ReactMarkdown></div>
                            {m.chart && (
                              <div className="an-chart">
                                <div className="an-chart-title">{m.chart.title}</div>
                                <ResponsiveContainer width="100%" height={220}>
                                  {m.chart.type === 'pie' ? (
                                    <PieChart>
                                      <Pie data={m.chart.data} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="label"
                                        label={({ value }) => value}>
                                        {m.chart.data.map((_, k) => <Cell key={k} fill={CHART_PALETTE[k % CHART_PALETTE.length]} />)}
                                      </Pie>
                                      <Tooltip contentStyle={{ background: chartBg, border: `1px solid ${chartBdr}`, borderRadius: 8, fontSize: 13 }} />
                                      <Legend wrapperStyle={{ fontSize: 12, color: chartText }} />
                                    </PieChart>
                                  ) : (
                                    <BarChart data={m.chart.data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                      <XAxis dataKey="label" stroke={chartText} tick={{ fill: chartText, fontSize: 11 }} />
                                      <YAxis stroke={chartText} tick={{ fill: chartText, fontSize: 11 }} allowDecimals={false} />
                                      <Tooltip contentStyle={{ background: chartBg, border: `1px solid ${chartBdr}`, borderRadius: 8, fontSize: 13 }} />
                                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {m.chart.data.map((_, k) => <Cell key={k} fill={CHART_PALETTE[k % CHART_PALETTE.length]} />)}
                                      </Bar>
                                    </BarChart>
                                  )}
                                </ResponsiveContainer>
                              </div>
                            )}
                          </>
                        ) : <p>{m.text}</p>}
                      </div>
                    </div>
                  ))}
                  {analystLoading && (
                    <div className="an-msg assistant">
                      <div className="an-avatar"><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2a3 3 0 00-3 3v1a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v1a7 7 0 01-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></svg></div>
                      <div className="an-bubble"><div className="an-typing"><span/><span/><span/></div></div>
                    </div>
                  )}
                  <div ref={analystEndRef} />
                </div>
              )}
            </div>

            <div className="analyst-input-row">
              <input
                type="text"
                value={analystInput}
                onChange={e => setAnalystInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') askAnalyst(); }}
                placeholder="Ask about GPAs, risk levels, engagement, grades…"
                disabled={analystLoading}
              />
              <button className="analyst-send" onClick={() => askAnalyst()} disabled={analystLoading || !analystInput.trim()}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Assessment Generator Tab ──────────────────────── */}
        {activeTab === 'assessment' && (
          <div className="asmt-wrap">
            {/* Config panel */}
            <div className="asmt-config">
              <div className="form-group">
                <label>Topic {asmtMaterial && <span className="asmt-or">(or use uploaded material below)</span>}</label>
                <input type="text" placeholder="e.g. Normalization in Relational Databases"
                  value={asmtConfig.topic}
                  onChange={e => setAsmtConfig({ ...asmtConfig, topic: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Course Name <span className="asmt-or">(optional)</span></label>
                <input type="text" placeholder="e.g. Database Systems"
                  value={asmtConfig.courseName}
                  onChange={e => setAsmtConfig({ ...asmtConfig, courseName: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Upload Material <span className="asmt-or">(PDF, Word, text — optional)</span></label>
                <input type="file" ref={asmtFileRef} onChange={handleAsmtUpload}
                  accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} />
                <button className="asmt-upload-btn" onClick={() => asmtFileRef.current.click()} disabled={asmtUploading}>
                  {asmtUploading ? <><div className="loader-xs" /> Reading file…</>
                    : asmtFileName ? <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> {asmtFileName}</>
                    : <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Choose a file</>}
                </button>
                {asmtFileName && (
                  <button className="asmt-clear" onClick={() => { setAsmtMaterial(''); setAsmtFileName(''); }}>Remove material</button>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Questions</label>
                  <input type="number" min="1" max="20" value={asmtConfig.numQuestions}
                    onChange={e => setAsmtConfig({ ...asmtConfig, numQuestions: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Difficulty</label>
                  <select value={asmtConfig.difficulty}
                    onChange={e => setAsmtConfig({ ...asmtConfig, difficulty: e.target.value })}>
                    {['Easy', 'Medium', 'Hard', 'Mixed'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Question Types</label>
                <div className="asmt-types">
                  {[
                    { id: 'mcq',       label: 'Multiple Choice' },
                    { id: 'truefalse', label: 'True / False' },
                    { id: 'short',     label: 'Short Answer' },
                    { id: 'essay',     label: 'Essay' },
                  ].map(t => (
                    <button key={t.id}
                      className={`asmt-type ${asmtConfig.types.includes(t.id) ? 'active' : ''}`}
                      onClick={() => toggleType(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {asmtError && <div className="asmt-error">{asmtError}</div>}

              <button className="submit-btn" onClick={generateAssessment} disabled={asmtLoading}>
                {asmtLoading ? 'Generating…' : '✨ Generate Assessment'}
              </button>
            </div>

            {/* Result panel */}
            <div className="asmt-result">
              {asmtLoading ? (
                <div className="asmt-loading">
                  <div className="loader" />
                  <p>Designing your assessment…</p>
                </div>
              ) : !asmtResult ? (
                <div className="asmt-empty">
                  <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                  <p>Your generated questions will appear here</p>
                  <span>Configure the options and click Generate</span>
                </div>
              ) : (
                <>
                  <div className="asmt-result-head">
                    <div>
                      <h3 className="asmt-result-title">{asmtResult.title}</h3>
                      <div className="asmt-result-meta">
                        {asmtResult.meta.numQuestions} questions · {asmtResult.meta.difficulty} difficulty
                      </div>
                    </div>
                    <div className="asmt-actions">
                      <button className="asmt-toggle" onClick={() => setShowAnswers(s => !s)}>
                        {showAnswers ? 'Hide answers' : 'Show answers'}
                      </button>
                      <button className="asmt-export" onClick={exportAssessment}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export
                      </button>
                    </div>
                  </div>

                  <div className="asmt-questions">
                    {asmtResult.questions.map((q, i) => (
                      <div key={i} className="asmt-q">
                        <div className="asmt-q-head">
                          <span className="asmt-q-num">Q{i + 1}</span>
                          <div className="asmt-q-tags">
                            <span className="asmt-tag type">{q.type}</span>
                            <span className={`asmt-tag diff-${(q.difficulty || '').toLowerCase()}`}>{q.difficulty}</span>
                            <span className="asmt-tag bloom">{q.bloom}</span>
                          </div>
                        </div>
                        <div className="asmt-q-text">{q.question}</div>
                        {q.options && (
                          <div className="asmt-options">
                            {q.options.map((o, j) => {
                              const letter = o.trim().charAt(0);
                              const isAns = showAnswers && (q.answer === letter || q.answer === o || o.startsWith(q.answer));
                              return <div key={j} className={`asmt-option ${isAns ? 'correct' : ''}`}>{o}{isAns && <span className="asmt-check">✓</span>}</div>;
                            })}
                          </div>
                        )}
                        {showAnswers && (
                          <div className="asmt-answer">
                            <span className="asmt-answer-label">Answer:</span> {q.answer}
                            {q.explanation && <div className="asmt-explanation">{q.explanation}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Add Course Tab ────────────────────────────────── */}
        {activeTab === 'courses' && (
          <div className="form-card">
            <div className="form-group">
              <label>Course Name</label>
              <input type="text" placeholder="e.g. Introduction to AI" value={newCourse.name}
                onChange={e => setNewCourse({ ...newCourse, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Course Code</label>
                <input type="text" placeholder="e.g. CS501" value={newCourse.code}
                  onChange={e => setNewCourse({ ...newCourse, code: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Credits</label>
                <input type="number" value={newCourse.credits}
                  onChange={e => setNewCourse({ ...newCourse, credits: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Instructor</label>
              <input type="text" placeholder="e.g. Dr. Ahmed Hassan" value={newCourse.instructor}
                onChange={e => setNewCourse({ ...newCourse, instructor: e.target.value })} />
            </div>
            <button className="submit-btn" onClick={handleAddCourse}>Add Course</button>
            <div className="existing-list">
              <div className="existing-label">Existing Courses ({courses.length})</div>
              {courses.map((c, i) => (
                <div key={i} className="existing-row">
                  <span className="ex-code">{c.code}</span>
                  <span className="ex-name">{c.name}</span>
                  <span className="ex-inst">{c.instructor}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Announcements Tab ─────────────────────────────── */}
        {activeTab === 'announcements' && (
          <div className="form-card">
            <div className="form-group">
              <label>Course</label>
              <select value={newAnnouncement.courseId}
                onChange={e => setNewAnnouncement({ ...newAnnouncement, courseId: e.target.value })}>
                <option value="">Select a course</option>
                {courses.map((c, i) => <option key={i} value={c._id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Title</label>
              <input type="text" placeholder="e.g. Quiz next week" value={newAnnouncement.title}
                onChange={e => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Body</label>
              <textarea rows={4} placeholder="Write your announcement…" value={newAnnouncement.body}
                onChange={e => setNewAnnouncement({ ...newAnnouncement, body: e.target.value })} />
            </div>
            <button className="submit-btn" onClick={handleAddAnnouncement}>Post Announcement</button>
          </div>
        )}

        {/* ── Grades Tab ────────────────────────────────────── */}
        {activeTab === 'grades' && (
          <div className="form-card">
            <div className="form-group">
              <label>Student</label>
              <select value={newGrade.studentId}
                onChange={e => setNewGrade({ ...newGrade, studentId: e.target.value })}>
                <option value="">Select a student</option>
                {students.map((s, i) => <option key={i} value={s.id}>{s.name} ({s.studentId})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Course</label>
              <select value={newGrade.courseId}
                onChange={e => setNewGrade({ ...newGrade, courseId: e.target.value })}>
                <option value="">Select a course</option>
                {courses.map((c, i) => <option key={i} value={c._id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Grade (%)</label>
                <input type="number" placeholder="85" min="0" max="100" value={newGrade.grade}
                  onChange={e => setNewGrade({ ...newGrade, grade: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Letter Grade</label>
                <select value={newGrade.letterGrade}
                  onChange={e => setNewGrade({ ...newGrade, letterGrade: e.target.value })}>
                  <option value="">Select</option>
                  {['A+','A','A-','B+','B','B-','C+','C','C-','D','F'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <button className="submit-btn" onClick={handleUpdateGrade}>Update Grade</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default Faculty;