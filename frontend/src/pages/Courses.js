import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Courses.css';

const API = 'http://localhost:5000/api/student';

function Courses() {
  const [courses, setCourses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [marking, setMarking]   = useState(null); // assignmentId being updated
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('acadai-theme') !== 'light');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  useEffect(() => { fetchCourses(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('acadai-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchCourses = async () => {
    try {
      const res = await axios.get(`${API}/dashboard`, { headers: headers() });
      setCourses(res.data.user.enrolledCourses);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleMarkAssignment = async (courseId, assignmentId, submitting) => {
    setMarking(assignmentId);
    // Optimistic update
    setCourses(prev => prev.map(c =>
      c._id === courseId
        ? { ...c, assignments: c.assignments.map(a =>
            a._id === assignmentId ? { ...a, submitted: submitting } : a
          )}
        : c
    ));
    try {
      const res = await axios.put(`${API}/mark-assignment`,
        { submitted: submitting, courseId, assignmentId },
        { headers: headers() }
      );
      // Save dynamic predictions for Grades page
      if (res.data.predictions) {
        localStorage.setItem('acadai-dynamic', JSON.stringify(res.data.predictions));
      }
    } catch (err) {
      console.error('Mark assignment error:', err);
      fetchCourses(); // revert on error
    } finally { setMarking(null); }
  };

  if (loading) return (
    <div className="loading-screen"><div className="loader" /><p>Loading courses…</p></div>
  );

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
          <a href="/dashboard" className="sb-link">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </a>
          <a href="/chat" className="sb-link">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            AI Assistant
          </a>
          <a href="/courses" className="sb-link sb-link-active">
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
          <button className="logout-btn" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login'; }}>Sign Out</button>
        </div>
      </aside>

      <main className="pg-main">
        <div className="pg-header">
          <div>
            <h1 className="pg-title">My Courses</h1>
            <p className="pg-subtitle">Mark assignments as done — ML predictions update automatically</p>
          </div>
          <span className="pg-count">{courses.length} courses</span>
        </div>

        <div className="courses-grid">
          {courses.map((course, i) => {
            const pending   = course.assignments?.filter(a => !a.submitted).length ?? 0;
            const submitted = course.assignments?.filter(a =>  a.submitted).length ?? 0;
            return (
              <div key={i} className="course-card">
                <div className="course-top">
                  <span className="course-code">{course.code}</span>
                  <span className="course-credits">{course.credits} cr</span>
                </div>
                <h3 className="course-name">{course.name}</h3>
                <p className="course-instructor">{course.instructor}</p>

                <div className="course-stats">
                  <div className="course-stat">
                    <div className="course-stat-num success">{submitted}</div>
                    <div className="course-stat-lbl">Submitted</div>
                  </div>
                  <div className="course-stat">
                    <div className={`course-stat-num ${pending > 0 ? 'warning' : 'muted'}`}>{pending}</div>
                    <div className="course-stat-lbl">Pending</div>
                  </div>
                  <div className="course-stat">
                    <div className="course-stat-num muted">{course.announcements?.length ?? 0}</div>
                    <div className="course-stat-lbl">Announcements</div>
                  </div>
                </div>

                {course.assignments?.length > 0 && (
                  <div className="course-section">
                    <div className="section-label">Assignments</div>
                    {course.assignments.map((a, j) => (
                      <div key={j} className={`assign-row ${a.submitted ? 'submitted' : ''}`}>
                        <div className="assign-left">
                          <span className={`assign-dot ${a.submitted ? 'success' : 'warning'}`} />
                          <span className={`assign-title ${a.submitted ? 'done-text' : ''}`}>{a.title}</span>
                        </div>
                        <div className="assign-right">
                          {!a.submitted ? (
                            <button
                              className="mark-done-btn"
                              disabled={marking === a._id}
                              onClick={() => handleMarkAssignment(course._id, a._id, true)}
                            >
                              {marking === a._id ? '…' : '✓ Mark Done'}
                            </button>
                          ) : (
                            <span className="assign-badge success">Submitted</span>
                          )}
                          <span className="assign-date">
                            {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {course.announcements?.length > 0 && (
                  <div className="course-section">
                    <div className="section-label">Announcements</div>
                    {course.announcements.map((a, j) => (
                      <div key={j} className="ann-row">
                        <div className="ann-title">{a.title}</div>
                        <div className="ann-body">{a.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default Courses;