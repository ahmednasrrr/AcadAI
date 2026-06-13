import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Grades.css';

function Grades() {
  const [grades, setGrades]           = useState([]);
  const [profile, setProfile]         = useState(null);
  const [courses, setCourses]         = useState([]);
  const [gradePrediction, setGradePrediction] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [darkMode, setDarkMode]       = useState(() => localStorage.getItem('acadai-theme') !== 'light');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  useEffect(() => { fetchGrades(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('acadai-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const fetchGrades = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/student/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(res.data.user.enrolledCourses);
      setProfile(res.data.profile);
      setGrades(res.data.profile.grades);
      setGradePrediction(res.data.gradePrediction);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getGradeClass = (g) => g >= 90 ? 'accent' : g >= 80 ? 'success' : g >= 70 ? 'warning' : 'danger';
  const getGradeLabel = (g) => g >= 90 ? 'Excellent' : g >= 80 ? 'Good' : g >= 70 ? 'Average' : 'Needs Improvement';

  if (loading) return (
    <div className="loading-screen"><div className="loader" /><p>Loading grades…</p></div>
  );

  // Check for live dynamic predictions from Dashboard/Courses interactions
  const dynamic = JSON.parse(localStorage.getItem('acadai-dynamic') || 'null');
  const displayGrade = dynamic?.grade || gradePrediction;
  const isLive = !!dynamic?.grade;

  return (
    <div className="pg-root">
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
          <a href="/dashboard" className="sb-link"><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Dashboard</a>
          <a href="/chat"      className="sb-link"><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>AI Assistant</a>
          <a href="/courses"   className="sb-link"><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>Courses</a>
          <a href="/grades"    className="sb-link sb-link-active"><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Grades</a>
        </nav>
        <div className="sb-footer">
          <button className="theme-btn" onClick={() => setDarkMode(d => !d)}>{darkMode ? '☀ Light Mode' : '☾ Dark Mode'}</button>
          <button className="logout-btn" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; }}>Sign Out</button>
        </div>
      </aside>

      <main className="pg-main">
        <div className="pg-header">
          <div>
            <h1 className="pg-title">My Grades</h1>
            <p className="pg-subtitle">Academic performance this semester</p>
          </div>
        </div>

        {/* GPA Overview */}
        <div className="gpa-card">
          <div className="gpa-left">
            <div className="gpa-label">Current GPA</div>
            <div className="gpa-value">{profile?.gpa?.toFixed(2)}</div>
            <div className="gpa-sub">out of 4.0</div>
          </div>
          <div className="gpa-divider" />
          <div className="gpa-stats">
            {[
              { val: profile?.engagement?.assignmentsSubmitted, lbl: 'Submitted' },
              { val: profile?.engagement?.assignmentsMissed,    lbl: 'Missed'    },
              { val: profile?.engagement?.quizzesTaken,         lbl: 'Quizzes'   },
              { val: profile?.engagement?.loginFrequency,       lbl: 'Logins'    },
            ].map((s, i) => (
              <div key={i} className="gpa-stat">
                <div className="gpa-stat-num">{s.val ?? '—'}</div>
                <div className="gpa-stat-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ML Grade Prediction */}
        {displayGrade?.predicted_grade && (
          <div className="prediction-card">
            <div className="pred-head">
              <div className="pred-title">
                <span className="pred-pill">ML</span>
                Grade Prediction
                {isLive && <span className="live-pill">🔄 Live</span>}
              </div>
              
            </div>
            <div className="pred-body">
              <div className="pred-score">
                <span className="pred-pct">{displayGrade.predicted_grade}%</span>
                <span className="pred-letter">{displayGrade.predicted_letter}</span>
              </div>
              <p className="pred-desc">
                {isLive
                  ? 'Updated based on your recent engagement changes — submit more assignments or increase study hours to improve this prediction.'
                  : 'Based on your engagement, submission rate, and login frequency — our ML model predicts this will be your final average grade.'
                }
              </p>
            </div>
          </div>
        )}

        {/* Grade Cards */}
        <div className="grades-list">
          {grades.map((g, i) => {
            const cls    = getGradeClass(g.grade);
            const course = g.course || courses.find(c => c._id === g.course) || courses[i];
            return (
              <div key={i} className="grade-card">
                <div className="grade-left">
                  <span className="grade-code">{course?.code}</span>
                  <div>
                    <div className="grade-course">{course?.name}</div>
                    <div className="grade-instructor">{course?.instructor}</div>
                  </div>
                </div>
                <div className="grade-right">
                  <div className="grade-bar-wrap">
                    <div className="grade-bar">
                      <div className={`grade-fill ${cls}`} style={{ width: `${g.grade}%` }} />
                    </div>
                    <span className="grade-pct">{g.grade}%</span>
                  </div>
                  <div className="grade-badges">
                    <span className={`grade-letter ${cls}`}>{g.letterGrade}</span>
                    <span className={`grade-lbl ${cls}`}>{getGradeLabel(g.grade)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default Grades;