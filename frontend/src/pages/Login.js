import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
      const user = res.data.user;
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(user));
      window.location.href = user.role === 'faculty' ? '/faculty' : '/dashboard';
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const FEATURES = [
    { title: 'AI Chat Assistant',   desc: 'Get instant answers about your academics',   icon: '◎' },
    { title: 'ML Risk Analysis',    desc: '5 machine learning models tracking your progress', icon: '▲' },
    { title: 'Smart Dashboard',     desc: 'GPA, deadlines, grades and predictions in one place', icon: '▦' },
  ];

  return (
    <div className="auth-root">
      {/* Left panel */}
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

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Welcome back 👋</h1>
            <p>Sign in to your AcadAI account</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="Enter your email"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" placeholder="Enter your password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="auth-divider" />

          <div className="demo-creds">
            <div className="demo-label">Demo credentials</div>
            <div className="demo-row">
              <span className="demo-badge">Student</span>
              <span>ahmed@acadai.com / ahmed123</span>
            </div>
            <div className="demo-row">
              <span className="demo-badge faculty">Faculty</span>
              <span>nermin@acadai.com / faculty123</span>
            </div>
          </div>

          <p className="auth-link">Don't have an account? <a href="/register">Register here</a></p>
        </div>
      </div>
    </div>
  );
}

export default Login;