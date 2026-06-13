import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';
import './Register.css';

function Register() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', studentId: '',
    year: '', major: '', semester: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('http://localhost:5000/api/auth/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const FEATURES = [
    { title: 'Auto Course Enrollment', desc: 'Courses assigned based on your year and major', icon: '◈' },
    { title: 'AI Chat Assistant',      desc: 'Get instant answers about your academics',     icon: '◎' },
    { title: 'ML Risk Analysis',       desc: '5 machine learning models tracking your progress', icon: '▲' },
  ];

  return (
    <div className="auth-root">
      {/* Left */}
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-logo">Acad<span>AI</span></div>
          <p className="auth-tagline">Your AI-powered academic assistant</p>
          <div className="auth-features">
            {FEATURES.map((f, i) => (
              <div key={i} className="auth-feature">
                <div className="auth-feature-icon">{f.icon}</div>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="auth-right reg-right">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Create an account 🎓</h1>
            <p>Join AcadAI and take control of your academics</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleRegister}>
            <div className="reg-row">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="Enter your full name" value={form.name} onChange={set('name')} required />
              </div>
              <div className="form-group">
                <label>Student ID</label>
                <input type="text" placeholder="e.g. 237328" value={form.studentId} onChange={set('studentId')} required />
              </div>
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="Enter your email" value={form.email} onChange={set('email')} required />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="Create a password" value={form.password} onChange={set('password')} required />
            </div>

            <div className="form-group">
              <label>Major</label>
              <select value={form.major} onChange={set('major')} required>
                <option value="">Select your major</option>
                <option value="Information Systems">Information Systems</option>
                <option value="Computer Science">Computer Science</option>
                <option value="Software Engineering">Software Engineering</option>
              </select>
            </div>

            <div className="reg-row">
              <div className="form-group">
                <label>Year</label>
                <select value={form.year} onChange={set('year')} required>
                  <option value="">Select year</option>
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>
              <div className="form-group">
                <label>Semester</label>
                <select value={form.semester} onChange={set('semester')} required>
                  <option value="">Select semester</option>
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                </select>
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="auth-link" style={{ marginTop: '20px' }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;