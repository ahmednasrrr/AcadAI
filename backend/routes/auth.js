const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Course = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');
const courseCatalog = require('../config/courseCatalog');

// @route POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, studentId, year, major, semester } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get courses from catalog
    const catalogCourses = courseCatalog[major]?.[year]?.[semester] || [];

    // Create or find courses in DB
    const courseIds = [];
    for (const courseData of catalogCourses) {
      let course = await Course.findOne({ code: courseData.code });
      if (!course) {
        course = await Course.create({
          name: courseData.name,
          code: courseData.code,
          instructor: courseData.instructor,
          credits: courseData.credits,
          assignments: [],
          announcements: [],
        });
      }
      courseIds.push(course._id);
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      studentId,
      role: 'student',
      year,
      major,
      semester,
      enrolledCourses: courseIds,
    });

    // Create student profile
    await StudentProfile.create({
      user: user._id,
      gpa: 0,
      riskLevel: 'Low',
      engagement: {
        loginFrequency: 0,
        assignmentsSubmitted: 0,
        assignmentsMissed: 0,
        quizzesTaken: 0,
        quizzesMissed: 0,
      },
      grades: [],
      chatHistory: [],
    });

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).populate('enrolledCourses');
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;