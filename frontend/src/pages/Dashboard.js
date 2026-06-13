// ============================================================
//  FILE: frontend/src/pages/Dashboard.js
//  PAGE: Student Dashboard  (http://localhost:3000/dashboard)
//
//  FEATURES IN THIS FILE:
//  ─────────────────────────────────────────────────────────
//  1. STAT CARDS              line ~240  – GPA, courses, pending, risk badge
//  2. STUDY PLANNER           line ~275  – slider simulate + What-If Calculator
//     └─ Simulate mode        line ~290  – drag hours → live grade/risk/stress
//     └─ What-If Calculator   line ~320  – set target grade → find required hours
//  3. RISK BREAKDOWN (SHAP)   line ~390  – explainable AI, 2-column factor view
//  4. ACADEMIC PROFILE        line ~450  – K-Means cluster + learning style
//  5. AI WEEKLY STUDY PLAN    line ~480  – Groq-generated 7-day plan
//  6. UPCOMING DEADLINES      line ~545  – mark-done triggers live ML recalc
//  7. ANNOUNCEMENTS           line ~570  – from courses the student is enrolled in
//
//  KEY FUNCTIONS:
//  ─────────────────────────────────────────────────────────
//  fetchDashboardData()       line ~81   – GET /api/student/dashboard (loads all ML)
//  handleMarkAssignment()     line ~101  – PUT /api/student/mark-assignment (live recalc)
//  handleStudyHoursChange()   line ~123  – PUT /api/student/study-hours  (debounced 600ms)
//  handleGeneratePlan()       line ~136  – POST /api/student/study-plan  (Groq AI)
//  handleWhatIf()             line ~150  – POST /api/student/whatif      (1-40h search)
//  applyDynamic()             line ~95   – applies live ML predictions + saves to localStorage
//
//  SHAP CONFIG (top of file)  line ~10   – which factors to show, relabels, detail text
//  Dynamic stress formula     line ~210  – stress = f(study hours, missed work)
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API = 'http://localhost:5000/api/student';

// SHAP shows only the factors the risk model genuinely weighs, mapped to the
// REAL data AcadAI tracks (quizzes, assignments, logins). Study hours is excluded
// (the classifier barely uses it) and is shown in the Study Planner instead.
const SHAP_VISIBLE = new Set([
  'Class Attendance', 'Assignment Completion', 'Online Engagement',
]);

// Map the model's feature names to the actual AcadAI metric they're derived from
const SHAP_RELABEL = {
  'Class Attendance':      'Quiz Attendance',      // derived from quizzes missed
  'Assignment Completion': 'Assignment Completion', // from assignments submitted/missed
  'Online Engagement':     'Login Activity',        // from login frequency
};
const factorLabel = (feature) => SHAP_RELABEL[feature] || feature;

// Plain-language interpretation, honest about the underlying metric
const FACTOR_PHRASES = {
  'Class Attendance':      { up: 'Missed quizzes are raising your risk',       down: 'Good quiz attendance is protecting you' },
  'Assignment Completion': { up: 'Missing assignments is raising your risk',   down: 'Completing assignments is helping you' },
  'Online Engagement':     { up: 'Low login activity is raising your risk',    down: 'Logging in regularly is helping you' },
};
const factorPhrase = (c) => {
  const m = FACTOR_PHRASES[c.feature];
  if (!m) return c.direction === 'increases' ? `${factorLabel(c.feature)} is raising your risk` : `${factorLabel(c.feature)} is helping you`;
  return c.direction === 'increases' ? m.up : m.down;
};

// The student's actual data behind each factor — makes SHAP concrete & verifiable
const factorDetail = (feature, e = {}) => {
  const qm = e.quizzesMissed ?? 0, am = e.assignmentsMissed ?? 0;
  const sub = e.assignmentsSubmitted ?? 0, lf = e.loginFrequency ?? 0;
  switch (feature) {
    case 'Class Attendance':      return qm === 0 ? 'No quizzes missed' : `${qm} quiz${qm === 1 ? '' : 'zes'} missed`;
    case 'Assignment Completion': return `${sub} submitted · ${am} missed`;
    case 'Online Engagement':     return `${lf} login${lf === 1 ? '' : 's'} logged`;
    default: return '';
  }
};

function Dashboard() {
  const [student, setStudent]                     = useState(null);
  const [profile, setProfile]                     = useState(null);
  const [mlInsights, setMlInsights]               = useState(null);
  const [gradePrediction, setGradePrediction]     = useState(null);
  const [clusterPrediction, setClusterPrediction] = useState(null);
  const [shapExplanation, setShapExplanation]     = useState(null);
  const [dynamicPredictions, setDynamicPredictions] = useState(null);
  const [studyHours, setStudyHours]               = useState(7);
  const [updating, setUpdating]                   = useState(false);
  const [loading, setLoading]                     = useState(true);
  const [darkMode, setDarkMode]                   = useState(() => localStorage.getItem('acadai-theme') !== 'light');

  // Study Plan
  const [studyPlan, setStudyPlan]     = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError]     = useState(null);

  // What-If
  const [whatIfTarget, setWhatIfTarget]   = useState(75);
  const [whatIfResult, setWhatIfResult]   = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  const sliderTimer = useRef(null);
  const planRef     = useRef(null);
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('acadai-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchDashboardData = async () => {
    try {
      const res = await axios.get(`${API}/dashboard`, { headers: headers() });
      setStudent(res.data.user);
      setProfile(res.data.profile);
      setMlInsights(res.data.mlInsights);
      setGradePrediction(res.data.gradePrediction);
      setClusterPrediction(res.data.clusterPrediction);
      setShapExplanation(res.data.shapExplanation);
      if (res.data.studyHoursGoal) setStudyHours(res.data.studyHoursGoal);
    } catch (err) { console.error('Dashboard error:', err); }
    finally { setLoading(false); }
  };

  const applyDynamic = (data) => {
    if (!data?.predictions) return;
    setDynamicPredictions(data.predictions);
    localStorage.setItem('acadai-dynamic', JSON.stringify(data.predictions));
  };

  const handleMarkAssignment = async (courseId, assignmentId, submitting) => {
    try {
      setUpdating(true);
      const res = await axios.put(`${API}/mark-assignment`,
        { submitted: submitting, courseId, assignmentId },
        { headers: headers() }
      );
      applyDynamic(res.data);
      setStudent(prev => ({
        ...prev,
        enrolledCourses: prev.enrolledCourses.map(c =>
          c._id === courseId
            ? { ...c, assignments: c.assignments.map(a =>
                a._id === assignmentId ? { ...a, submitted: submitting } : a
              )}
            : c
        )
      }));
    } catch (err) { console.error('Mark assignment error:', err); }
    finally { setUpdating(false); }
  };

  const handleStudyHoursChange = (hours) => {
    setStudyHours(hours);
    clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(async () => {
      try {
        setUpdating(true);
        const res = await axios.put(`${API}/study-hours`, { hours }, { headers: headers() });
        applyDynamic(res.data);
      } catch (err) { console.error('Study hours error:', err); }
      finally { setUpdating(false); }
    }, 600);
  };

  const handleGeneratePlan = async (targetGrade = null, requiredHours = null) => {
    try {
      setPlanLoading(true);
      setPlanError(null);
      planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const body = targetGrade ? { target_grade: targetGrade, required_hours: requiredHours } : {};
      const res = await axios.post(`${API}/study-plan`, body, { headers: headers() });
      setStudyPlan(res.data.plan);
    } catch (err) {
      setPlanError('Failed to generate plan. Please try again.');
      console.error('Study plan error:', err);
    } finally { setPlanLoading(false); }
  };

  const handleWhatIf = async () => {
    try {
      setWhatIfLoading(true);
      const res = await axios.post(`${API}/whatif`, { target_grade: whatIfTarget }, { headers: headers() });
      setWhatIfResult(res.data);
    } catch (err) { console.error('What-if error:', err); }
    finally { setWhatIfLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const getRiskConfig = (risk) => ({
    'High':   { cls: 'danger',  label: 'High Risk'   },
    'Medium': { cls: 'warning', label: 'Medium Risk'  },
    'Low':    { cls: 'success', label: 'Low Risk'     },
  }[risk] || { cls: 'success', label: 'Low Risk' });

  const getUpcomingDeadlines = () => {
    if (!student?.enrolledCourses) return [];
    const deadlines = [];
    student.enrolledCourses.forEach(course => {
      course.assignments?.forEach(a => {
        if (!a.submitted) deadlines.push({
          title: a.title, course: course.name,
          dueDate: new Date(a.dueDate),
          courseId: course._id, assignmentId: a._id,
        });
      });
    });
    return deadlines.sort((a, b) => a.dueDate - b.dueDate);
  };

  const getDueLabel = (date) => {
    const diff = Math.ceil((date - new Date()) / 86400000);
    if (diff < 0)   return { text: 'Overdue',  urgent: true };
    if (diff === 0) return { text: 'Today',    urgent: true };
    if (diff === 1) return { text: 'Tomorrow', urgent: true };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false };
  };

  if (loading) return (
    <div className="loading-screen"><div className="loader" /><p>Loading your dashboard…</p></div>
  );

  const deadlines    = getUpcomingDeadlines();
  const confidence   = mlInsights?.confidence?.[profile?.riskLevel];
  const liveRisk     = dynamicPredictions?.risk  || { risk_level: profile?.riskLevel, confidence: mlInsights?.confidence };
  const liveGrade    = dynamicPredictions?.grade || gradePrediction;
  const liveRiskCfg  = getRiskConfig(liveRisk?.risk_level);
  const riskColor    = { danger: '#f87171', warning: '#fbbf24', success: '#34d399' }[liveRiskCfg.cls];

  // Grade change vs the student's baseline (initial) prediction
  const baselineGrade = gradePrediction?.predicted_grade;
  const gradeDelta = (liveGrade?.predicted_grade != null && baselineGrade != null)
    ? +(liveGrade.predicted_grade - baselineGrade).toFixed(1) : null;

  // Dynamic stress — computed instantly from the slider + workload (more study → calmer)
  const workload   = (profile?.engagement?.assignmentsMissed || 0) + (profile?.engagement?.quizzesMissed || 0);
  const stressPct  = Math.round(Math.max(5, Math.min(95, 50 - (studyHours - 10) * 2.2 + workload * 12)));
  const stressInfo = stressPct < 35 ? { lvl: 'Low', cls: 'success' }
                   : stressPct < 65 ? { lvl: 'Moderate', cls: 'warning' }
                   : { lvl: 'High', cls: 'danger' };

  // SHAP — prefer the live (dynamic) explanation so it updates with the slider
  const activeShap   = dynamicPredictions?.shap || shapExplanation;
  const visibleShap  = (activeShap?.contributions || []).filter(c => SHAP_VISIBLE.has(c.feature) && c.width > 0);
  const increasing   = visibleShap.filter(c => c.direction === 'increases').slice(0, 5);
  const decreasing   = visibleShap.filter(c => c.direction === 'decreases').slice(0, 5);
  const topUp        = increasing[0];
  const topDown      = decreasing[0];
  let riskSummary    = '';
  if (topUp)   riskSummary += `The biggest factor raising your risk is ${factorLabel(topUp.feature).toLowerCase()}.`;
  if (topDown) riskSummary += `${topUp ? ' On the bright side, ' : 'Good news — '}${factorLabel(topDown.feature).toLowerCase()} is working in your favor.`;
  if (!topUp && !topDown) riskSummary = 'Your engagement looks balanced across all tracked factors.';
  const showRiskCard = visibleShap.length > 0 || (mlInsights?.suggestions?.length > 0);

  return (
    <div className="db-root">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sb-logo">Acad<span>AI</span></div>
        <div className="sb-profile">
          <div className="sb-avatar">{user?.name?.charAt(0)}</div>
          <div className="sb-profile-text">
            <div className="sb-name">{user?.name}</div>
            <div className="sb-role">Student</div>
          </div>
        </div>
        <nav className="sb-nav">
          <div className="sb-nav-label">Main Menu</div>
          <a href="/dashboard" className="sb-link sb-link-active">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </a>
          <a href="/chat" className="sb-link">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            AI Assistant
          </a>
          <a href="/courses" className="sb-link">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            Courses
          </a>
          <a href="/grades" className="sb-link">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Grades
          </a>
        </nav>
        <div className="sb-footer">
          <button className="theme-btn" onClick={() => setDarkMode(d => !d)}>
            {darkMode ? '☀ Light Mode' : '☾ Dark Mode'}
          </button>
          <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="db-main">
        <header className="db-header">
          <div>
            <h1 className="db-greeting">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="db-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <span className="id-badge">ID: {student?.studentId}</span>
        </header>

        {/* ── Stat Cards ─────────────────────────────────────── */}
        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            </div>
            <div className="stat-label">Current GPA</div>
            <div className="stat-num accent">{profile?.gpa?.toFixed(2) ?? '—'}</div>
            <div className="stat-meta">{student?.major} · {student?.year}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(96,165,250,0.12)', color: 'var(--info)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
            </div>
            <div className="stat-label">Enrolled Courses</div>
            <div className="stat-num">{student?.enrolledCourses?.length ?? 0}</div>
            <div className="stat-meta">{student?.semester}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: deadlines.length > 3 ? 'var(--warning-bg)' : 'var(--success-bg)', color: deadlines.length > 3 ? 'var(--warning)' : 'var(--success)' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </div>
            <div className="stat-label">Pending Assignments</div>
            <div className={`stat-num ${deadlines.length > 3 ? 'warning' : ''}`}>{deadlines.length}</div>
            <div className="stat-meta">{deadlines.length === 0 ? 'All caught up!' : 'Requires attention'}</div>
          </div>
          <div className="stat-card" style={{ borderColor: `${riskColor}30` }}>
            <div className="stat-icon" style={{ background: `${riskColor}15`, color: riskColor }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div className="stat-label">Academic Risk</div>
            <div className={`stat-num ${liveRiskCfg.cls}`}>{liveRisk?.risk_level ?? '—'}</div>
            <div className="stat-meta">{dynamicPredictions ? '🔄 Live updated' : confidence ? `${confidence.toFixed(0)}% confidence` : 'ML assessed'}</div>
          </div>
        </section>

        {/* ── Study Planner (slider simulate + target what-if) ── */}
        <section className="card planner-card">
          <div className="card-head">
            <div className="card-title">
              <span className="icon-pill" style={{ background: 'rgba(129,140,248,0.12)', color: 'var(--accent)' }}>⏱</span>
              Study Planner
              <span className="live-pill">LIVE ML</span>
            </div>
            
          </div>

          {/* Simulate */}
          <div className="planner-section">
            <div className="planner-label">Simulate — drag your weekly study hours and watch the impact</div>
            <div className="slider-wrap">
              <span className="slider-bound">1h</span>
              <input
                type="range" min="1" max="20" step="1"
                value={studyHours}
                onChange={e => handleStudyHoursChange(Number(e.target.value))}
                className="study-range"
              />
              <span className="slider-bound">20h</span>
              <span className="slider-val">{studyHours} hrs/week</span>
            </div>
            <div className="impact-grid">
              <div className="impact-box">
                <div className="impact-lbl">Predicted Grade
                  {gradeDelta != null && gradeDelta !== 0 && (
                    <span className={`delta-chip ${gradeDelta > 0 ? 'up' : 'down'}`}>
                      {gradeDelta > 0 ? '▲' : '▼'} {Math.abs(gradeDelta)}%
                    </span>
                  )}
                </div>
                <div className={`impact-num ${liveGrade?.predicted_grade >= 80 ? 'success' : liveGrade?.predicted_grade >= 65 ? 'warning' : 'danger'}`}>
                  {liveGrade?.predicted_grade ?? '—'}{liveGrade?.predicted_grade ? '%' : ''}
                </div>
                <div className="impact-sub">{liveGrade?.predicted_letter ?? ''} · vs your current {baselineGrade ?? '—'}%</div>
              </div>
              <div className="impact-box">
                <div className="impact-lbl">Risk Level</div>
                <div className={`impact-num ${liveRiskCfg.cls}`}>{liveRisk?.risk_level ?? '—'}</div>
                <div className="impact-sub">
                  {liveRisk?.confidence?.[liveRisk?.risk_level]
                    ? `${liveRisk.confidence[liveRisk.risk_level].toFixed(0)}% confidence`
                    : 'ML assessed'}
                </div>
              </div>
              <div className="impact-box">
                <div className="impact-lbl">Stress Level</div>
                <div className={`impact-num ${stressInfo.cls}`}>{stressInfo.lvl}</div>
                <div className="impact-sub">{stressPct}% · eases as you study more</div>
              </div>
            </div>
          </div>

          <div className="planner-divider" />

          {/* Target */}
          <div className="planner-section">
            <div className="planner-label">Reach a goal — set a target grade and see the hours required</div>
            <div className="whatif-target-row">
              <span className="whatif-label">Target Grade</span>
              <input
                type="range" min="50" max="100" step="1"
                value={whatIfTarget}
                onChange={e => { setWhatIfTarget(Number(e.target.value)); setWhatIfResult(null); }}
                className="study-range"
              />
              <span className="whatif-val">{whatIfTarget}%</span>
              <button className="action-btn" onClick={handleWhatIf} disabled={whatIfLoading}>
                {whatIfLoading ? '⟳' : 'Calculate'}
              </button>
            </div>

            {whatIfResult && (
              <div className="whatif-result">
                {whatIfResult.required ? (
                  <div className="whatif-callout success">
                    <div className="whatif-callout-main">
                      <div className="whatif-callout-text">To reach <strong>{whatIfTarget}%</strong>, study about</div>
                      <div className="whatif-callout-hours">{whatIfResult.required.hours}<span> hrs/week</span></div>
                      <div className="whatif-callout-diff">
                        {whatIfResult.required.hours - studyHours > 0
                          ? `That's ${whatIfResult.required.hours - studyHours}h more than your current goal of ${studyHours}h`
                          : whatIfResult.required.hours - studyHours < 0
                            ? `You're already studying enough — ${studyHours - whatIfResult.required.hours}h above what's needed`
                            : `That matches your current goal of ${studyHours}h`}
                      </div>
                    </div>
                    <div className="whatif-callout-tags">
                      <span className={`whatif-tag ${getRiskConfig(whatIfResult.required.risk).cls}`}>{whatIfResult.required.risk} risk</span>
                      <button className="whatif-plan-btn" onClick={() => handleGeneratePlan(whatIfTarget, whatIfResult.required.hours)}>
                        📋 Get a plan for {whatIfTarget}%
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="whatif-callout danger">
                    <div className="whatif-callout-main">
                      <div className="whatif-callout-text">Reaching <strong>{whatIfTarget}%</strong> takes more than study time alone</div>
                      <div className="whatif-callout-diff">
                        Combine intensive study with stronger attendance and on-time assignments to get there — your AI study plan will show you exactly how.
                      </div>
                    </div>
                    <div className="whatif-callout-tags">
                      <button className="whatif-plan-btn" onClick={() => handleGeneratePlan(whatIfTarget, null)}>
                        📋 Build a plan for {whatIfTarget}%
                      </button>
                    </div>
                  </div>
                )}

                {/* Full grade curve with target line */}
                <div className="curve-box">
                  <div className="curve-target-line" style={{ bottom: `${(whatIfTarget / 100) * 90}px` }}>
                    <span className="curve-target-label">Target {whatIfTarget}%</span>
                  </div>
                  <div className="curve-bars">
                    {whatIfResult.curve.map((p, i) => (
                      <div key={i} className="curve-col" title={`${p.hours}h → ${p.grade}%`}>
                        <div
                          className={`curve-bar ${p.grade >= whatIfTarget ? 'hit' : 'miss'} ${whatIfResult.required && p.hours === whatIfResult.required.hours ? 'marked' : ''}`}
                          style={{ height: `${Math.max(3, (p.grade / 100) * 90)}px` }}
                        />
                        {(p.hours % 5 === 0 || p.hours === 1) && <span className="curve-x">{p.hours}h</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Risk Breakdown (SHAP + recommendations, merged) ── */}
        {showRiskCard && (
          <section className="card risk-breakdown">
            <div className="card-head">
              <div className="card-title">
                <span className={`icon-pill ${liveRiskCfg.cls}`}>AI</span>
                Understanding Your {liveRisk?.risk_level} Risk
                {dynamicPredictions?.shap && <span className="live-pill">LIVE</span>}
              </div>
              <span className="ml-pill">SHAP · Explainable AI</span>
            </div>

            <p className="risk-summary">{riskSummary}</p>
            <p className="risk-caption">
              Calculated from your real tracked data — quizzes, assignment submissions, and logins. Each factor below shows the actual numbers behind it.
            </p>

            {visibleShap.length > 0 && (
              <div className="factor-cols">
                <div className="factor-col">
                  <div className="factor-col-head danger">
                    <span className="factor-arrow">▲</span> Raising your risk
                  </div>
                  {increasing.length === 0
                    ? <div className="factor-empty">Nothing major is raising your risk 🎉</div>
                    : increasing.map((c, i) => (
                      <div key={i} className="factor-item">
                        <div className="factor-top">
                          <span className="factor-name">{factorLabel(c.feature)}</span>
                          <span className="factor-data">{factorDetail(c.feature, profile?.engagement)}</span>
                        </div>
                        <div className="factor-bar-track">
                          <div className="factor-bar danger" style={{ width: `${c.width}%` }} />
                        </div>
                        <div className="factor-phrase">{factorPhrase(c)}</div>
                      </div>
                    ))
                  }
                </div>

                <div className="factor-col">
                  <div className="factor-col-head success">
                    <span className="factor-arrow">▼</span> Working in your favor
                  </div>
                  {decreasing.length === 0
                    ? <div className="factor-empty">No strong protective factors yet</div>
                    : decreasing.map((c, i) => (
                      <div key={i} className="factor-item">
                        <div className="factor-top">
                          <span className="factor-name">{factorLabel(c.feature)}</span>
                          <span className="factor-data">{factorDetail(c.feature, profile?.engagement)}</span>
                        </div>
                        <div className="factor-bar-track">
                          <div className="factor-bar success" style={{ width: `${c.width}%` }} />
                        </div>
                        <div className="factor-phrase">{factorPhrase(c)}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {mlInsights?.suggestions?.length > 0 && (
              <div className="risk-actions">
                <div className="risk-actions-head">What you can do</div>
                {mlInsights.suggestions.map((s, i) => (
                  <div key={i} className="risk-row"><span className="dot success" />{s}</div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Academic Profile (cluster) ─────────────────────── */}
        {clusterPrediction && (
          <section className="card cluster-card">
            <div className="card-head">
              <div className="card-title">
                <span className="icon-pill" style={{ background: clusterPrediction.bg, color: clusterPrediction.color }}>ML</span>
                Academic Profile
              </div>
              
            </div>
            <div className="cluster-body">
              <div className="cluster-main">
                <div className="cluster-name" style={{ color: clusterPrediction.color }}>{clusterPrediction.cluster_name}</div>
                <p className="cluster-desc">{clusterPrediction.description}</p>
                <div className="cluster-advice"><span>💡</span> {clusterPrediction.advice}</div>
              </div>
              {clusterPrediction.learning_style && (
                <div className="cluster-side">
                  <div className="cluster-style-tag">📚 {clusterPrediction.learning_style}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── AI Weekly Study Plan ───────────────────────────── */}
        <section className="card plan-card" ref={planRef}>
          <div className="card-head">
            <div className="card-title">
              <span className="icon-pill" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--success)' }}>✨</span>
              AI Weekly Study Plan
            </div>
            <span className="ml-pill" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--success)' }}>Groq AI</span>
          </div>

          {!studyPlan && !planLoading && (
            <div className="plan-empty">
              <p className="card-desc">
                Get a personalised 7-day plan built from your risk profile, learning style ({clusterPrediction?.learning_style || 'Blended Learning'}), and pending assignments.
              </p>
              {planError && <div className="plan-error">{planError}</div>}
              <button className="action-btn accent" onClick={() => handleGeneratePlan()}>✨ Generate My Study Plan</button>
            </div>
          )}

          {planLoading && (
            <div className="plan-generating">
              <div className="loader" />
              <p>Groq AI is building your personalised plan…</p>
            </div>
          )}

          {studyPlan && !planLoading && (
            <div className="plan-content">
              <p className="plan-overview">{studyPlan.overview}</p>
              <div className="plan-days">
                {studyPlan.days?.map((d, i) => (
                  <div key={i} className="plan-day">
                    <div className="plan-day-name">{d.day}</div>
                    <div className="plan-day-focus">{d.focus}</div>
                    <div className="plan-day-hours">{d.hours}h</div>
                    <ul className="plan-day-tasks">
                      {d.tasks?.map((t, j) => <li key={j}>{t}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              {studyPlan.tips?.length > 0 && (
                <div className="plan-tips">
                  <div className="plan-tips-head">Advisor Tips</div>
                  {studyPlan.tips.map((t, i) => (
                    <div key={i} className="risk-row"><span className="dot success" />{t}</div>
                  ))}
                </div>
              )}
              <button className="regen-btn" onClick={() => handleGeneratePlan()} disabled={planLoading}>↺ Regenerate Plan</button>
            </div>
          )}
        </section>

        {/* ── Bottom Grid (Deadlines + Announcements) ────────── */}
        <section className="bottom-grid">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Upcoming Deadlines</div>
              <span className="count-pill">{deadlines.length}</span>
            </div>
            {deadlines.length === 0
              ? <div className="empty-msg">No pending assignments — great work! 🎉</div>
              : deadlines.slice(0, 6).map((d, i) => {
                  const due = getDueLabel(d.dueDate);
                  return (
                    <div key={i} className="list-row">
                      <div className="list-info">
                        <div className="list-title">{d.title}</div>
                        <div className="list-sub">{d.course}</div>
                      </div>
                      <div className="deadline-actions">
                        <span className={`due-pill ${due.urgent ? 'urgent' : ''}`}>{due.text}</span>
                        <button
                          className="mark-done-btn"
                          disabled={updating}
                          onClick={() => handleMarkAssignment(d.courseId, d.assignmentId, true)}
                        >✓ Done</button>
                      </div>
                    </div>
                  );
                })
            }
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Announcements</div></div>
            {student?.enrolledCourses?.flatMap(course =>
              (course.announcements || []).map((a, i) => (
                <div key={`${course.name}-${i}`} className="announcement">
                  <div className="ann-course">{course.name}</div>
                  <div className="ann-title">{a.title}</div>
                  <div className="ann-body">{a.body}</div>
                </div>
              ))
            )}
            {student?.enrolledCourses?.every(c => !(c.announcements || []).length) && (
              <div className="empty-msg">No announcements right now</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
