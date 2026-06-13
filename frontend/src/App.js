import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Courses from './pages/Courses';
import Grades from './pages/Grades';
import Faculty from './pages/Faculty';
import Register from './pages/Register';



function App() {
  const token = localStorage.getItem('token');
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { user = {}; }

  const getHome = () => {
    if (!token) return <Navigate to="/login" />;
    if (user.role === 'faculty') return <Navigate to="/faculty" />;
    return <Navigate to="/dashboard" />;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={getHome()} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/chat" element={token ? <Chat /> : <Navigate to="/login" />} />
        <Route path="/courses" element={token ? <Courses /> : <Navigate to="/login" />} />
        <Route path="/grades" element={token ? <Grades /> : <Navigate to="/login" />} />
        <Route path="/faculty" element={token && user.role === 'faculty' ? <Faculty /> : <Navigate to="/login" />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </Router>
  );
}

export default App;