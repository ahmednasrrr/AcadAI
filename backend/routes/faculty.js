// ============================================================
//  FILE: backend/routes/faculty.js
//  MOUNTED AT: /api/faculty  (server.js line ~35)
//
//  ENDPOINTS & FEATURES:
//  ─────────────────────────────────────────────────────────
//  GET  /dashboard            line ~100  – FACULTY OVERVIEW
//    Fetches all students + profiles from MongoDB, calls Flask /predict-cluster
//    for each student in parallel → returns students array + courses list.
//
//  POST /analyst              line ~120  – AI ANALYST (Groq)
//    buildRoster() assembles live student snapshot + pre-computes aggregates
//    (averages, counts) in Node so Groq never has to do math.
//    Groq returns JSON: { answer, chart, highlights }.
//    Chart is optional (bar/pie) rendered by Recharts on the frontend.
//
//  POST /generate-assessment  line ~195  – AI ASSESSMENT GENERATOR (Groq)
//    Accepts topic string OR extracted file text (from /api/chat/upload).
//    Configurable: numQuestions, difficulty, types (mcq/truefalse/short/essay).
//    Each question tagged with Bloom's taxonomy level + difficulty.
//    Returns: title, questions[], meta{}.
//
//  POST /course               line ~275  – ADD COURSE to catalog
//  POST /announcement         line ~284  – POST ANNOUNCEMENT to a course
//  PUT  /grade                line ~295  – UPDATE STUDENT GRADE
//    Also recalculates GPA and risk level from grade percentages.
//
//  HELPER FUNCTIONS:
//  parseJSON()                line ~25   – robust JSON parse (handles code fences)
//  buildRoster()              line ~35   – live snapshot of all students for the Analyst
//  getStudentCluster()        line ~90   – calls Flask /predict-cluster for one student
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const Groq    = require('groq-sdk');
const authMiddleware        = require('../middleware/auth');
const { facultyOnly }       = require('../middleware/auth');
const User           = require('../models/User');
const Course         = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');

const ML = 'http://127.0.0.1:5001';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Robustly parse a JSON object out of an LLM response (handles code fences / stray text)
const parseJSON = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
};

// Build a compact roster snapshot + aggregate statistics for the AI Analyst
const buildRoster = async () => {
  const students = await User.find({ role: 'student' }).populate('enrolledCourses');
  const profiles = await StudentProfile.find().populate('grades.course');

  const roster = students.map(s => {
    const p   = profiles.find(pr => pr.user?.toString() === s._id.toString());
    const grd = p?.grades || [];
    const avg = grd.length ? Math.round(grd.reduce((a, g) => a + (g.grade || 0), 0) / grd.length) : null;
    return {
      name:              s.name,
      studentId:         s.studentId,
      major:             s.major || '—',
      year:              s.year  || '—',
      gpa:               p?.gpa ?? 0,
      riskLevel:         p?.riskLevel || 'Low',
      assignmentsMissed: p?.engagement?.assignmentsMissed ?? 0,
      assignmentsSubmitted: p?.engagement?.assignmentsSubmitted ?? 0,
      quizzesMissed:     p?.engagement?.quizzesMissed ?? 0,
      loginFrequency:    p?.engagement?.loginFrequency ?? 0,
      avgGrade:          avg,
      courses:           s.enrolledCourses.map(c => c.code),
      grades:            grd.map(g => ({ course: g.course?.code || '?', grade: g.grade, letter: g.letterGrade })),
    };
  });

  const n     = roster.length || 1;
  const sum   = (f) => roster.reduce((a, r) => a + (f(r) || 0), 0);
  const count = (f) => roster.filter(f).length;

  const agg = {
    totalStudents:  roster.length,
    avgGPA:         +(sum(r => r.gpa) / n).toFixed(2),
    riskCounts: {
      High:   count(r => r.riskLevel === 'High'),
      Medium: count(r => r.riskLevel === 'Medium'),
      Low:    count(r => r.riskLevel === 'Low'),
    },
    totalAssignmentsMissed: sum(r => r.assignmentsMissed),
    avgLoginFrequency:      +(sum(r => r.loginFrequency) / n).toFixed(1),
    majors: [...new Set(roster.map(r => r.major))],
  };

  return { roster, agg };
};

// ── AI Analyst — natural-language Q&A over student data ───────
router.post('/analyst', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: 'Question is required' });

    const { roster, agg } = await buildRoster();

    const systemPrompt = `You are the AcadAI Faculty Analyst — a data analyst assistant for Dr. Nermin Othman, a university program coordinator at the British University in Egypt.

You answer questions about her students using ONLY the data provided below. Be precise, professional, and concise. When you state numbers, they must come directly from the data or the pre-computed aggregates — never invent values.

PRE-COMPUTED AGGREGATES:
${JSON.stringify(agg, null, 2)}

FULL STUDENT ROSTER (${roster.length} students):
${JSON.stringify(roster, null, 2)}

RULES:
- If the question cannot be answered from this data, say so clearly.
- Reference students by name when relevant.
- Keep the written answer focused (2-5 sentences or a short list/table).
- Risk levels are ML-predicted (Low / Medium / High). GPA is on a 0-4 scale.

Respond with ONLY valid JSON (no markdown fences, no extra text):
{
  "answer": "A clear, well-formatted markdown answer. You may use **bold**, bullet lists, or markdown tables.",
  "chart": null OR { "type": "bar" | "pie", "title": "short title", "data": [{ "label": "string", "value": number }] },
  "highlights": [ { "label": "metric name", "value": "metric value" } ]
}

Only include a "chart" when the question involves a distribution, ranking, or comparison that benefits from visualization. Include 1-3 "highlights" with the single most important numbers from your answer (or an empty array).`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const raw    = completion.choices[0]?.message?.content || '';
    const parsed = parseJSON(raw);

    if (!parsed) {
      // Fallback: return the raw text as the answer
      return res.json({ answer: raw || 'I could not generate an answer.', chart: null, highlights: [] });
    }

    res.json({
      answer:     parsed.answer || 'No answer generated.',
      chart:      parsed.chart && Array.isArray(parsed.chart.data) ? parsed.chart : null,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 3) : [],
    });
  } catch (err) {
    console.error('Analyst error:', err);
    res.status(500).json({ message: 'Analyst error', error: err.message });
  }
});

// ── AI Assessment Generator ───────────────────────────────────
router.post('/generate-assessment', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const {
      topic        = '',
      material     = '',
      numQuestions = 5,
      types        = ['mcq'],
      difficulty   = 'Medium',
      courseName   = '',
    } = req.body;

    if (!topic.trim() && !material.trim()) {
      return res.status(400).json({ message: 'Provide a topic or upload material' });
    }

    const n      = Math.max(1, Math.min(20, parseInt(numQuestions) || 5));
    const source = material.trim()
      ? `Base the questions strictly on this source material:\n"""\n${material.slice(0, 12000)}\n"""`
      : `Base the questions on this topic: "${topic}".`;

    const typeList = types.length ? types.join(', ') : 'mcq';

    const systemPrompt = `You are an expert university assessment designer. Generate a high-quality ${difficulty}-difficulty assessment of exactly ${n} questions${courseName ? ` for the course "${courseName}"` : ''}.

${source}

Allowed question types: ${typeList}.
- "mcq": 4 options labelled A-D, exactly one correct.
- "truefalse": statement that is clearly True or False.
- "short": a short-answer question with a concise model answer.
- "essay": an open-ended question with key points expected in a strong answer.

Distribute questions across the allowed types. Each question must include a Bloom's taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, or Create) and a per-question difficulty (Easy, Medium, Hard).

Respond with ONLY valid JSON (no markdown fences, no extra text):
{
  "title": "Assessment title",
  "questions": [
    {
      "type": "mcq",
      "question": "the question text",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "why this is correct",
      "bloom": "Apply",
      "difficulty": "Medium"
    },
    {
      "type": "truefalse",
      "question": "statement",
      "options": ["True", "False"],
      "answer": "True",
      "explanation": "...",
      "bloom": "Understand",
      "difficulty": "Easy"
    },
    {
      "type": "short",
      "question": "...",
      "answer": "model answer",
      "bloom": "Analyze",
      "difficulty": "Medium"
    },
    {
      "type": "essay",
      "question": "...",
      "answer": "key points expected",
      "bloom": "Evaluate",
      "difficulty": "Hard"
    }
  ]
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.6,
      max_tokens: 6000,
    });

    const raw    = completion.choices[0]?.message?.content || '';
    const parsed = parseJSON(raw);

    if (!parsed || !Array.isArray(parsed.questions)) {
      return res.status(502).json({ message: 'Failed to generate a valid assessment. Please try again.' });
    }

    res.json({
      title:      parsed.title || (topic ? `${topic} — Assessment` : 'Generated Assessment'),
      questions:  parsed.questions,
      meta:       { difficulty, numQuestions: parsed.questions.length, types, generatedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error('Assessment error:', err);
    res.status(500).json({ message: 'Assessment generation error', error: err.message });
  }
});

// Get K-Means cluster for a single student
const getStudentCluster = async (profile) => {
  try {
    const avgGrade = profile.grades?.length
      ? Math.round(profile.grades.reduce((s, g) => s + g.grade, 0) / profile.grades.length)
      : 50;
    const r = await axios.post(`${ML}/predict-cluster`, {
      gpa:                profile.gpa                          || 0,
      assignments_missed: profile.engagement?.assignmentsMissed || 0,
      quizzes_missed:     profile.engagement?.quizzesMissed     || 0,
      login_frequency:    profile.engagement?.loginFrequency    || 0,
      average_grade:      avgGrade,
    });
    return { cluster_name: r.data.cluster_name, color: r.data.color, bg: r.data.bg };
  } catch {
    return { cluster_name: 'Unknown', color: '#8892a8', bg: 'rgba(136,146,168,0.1)' };
  }
};

// @route GET /api/faculty/dashboard
router.get('/dashboard', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).populate('enrolledCourses');
    const profiles = await StudentProfile.find().populate('user');

    // Build base student data
    const baseData = students.map(student => {
      const profile = profiles.find(p => p.user?._id.toString() === student._id.toString());
      return { student, profile };
    });

    // Fetch clusters for all students in parallel
    const clusters = await Promise.all(
      baseData.map(({ profile }) => profile ? getStudentCluster(profile) : Promise.resolve({ cluster_name: 'Unknown', color: '#8892a8', bg: '' }))
    );

    const studentData = baseData.map(({ student, profile }, i) => ({
      id:             student._id,
      name:           student.name,
      email:          student.email,
      studentId:      student.studentId,
      major:          student.major    || '',
      year:           student.year     || '',
      gpa:            profile?.gpa     || 0,
      riskLevel:      profile?.riskLevel || 'Low',
      engagement:     profile?.engagement || {},
      grades:         profile?.grades   || [],
      enrolledCourses: student.enrolledCourses,
      clusterProfile: clusters[i],
    }));

    const courses = await Course.find();
    res.json({ students: studentData, courses });
  } catch (err) {
    console.error('Faculty dashboard error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/faculty/course
router.post('/course', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const { name, code, instructor, credits } = req.body;
    const course = await Course.create({ name, code, instructor, credits });
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/faculty/announcement
router.post('/announcement', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const { courseId, title, body } = req.body;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    course.announcements.push({ title, body, date: new Date() });
    await course.save();
    res.json({ message: 'Announcement added', course });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route PUT /api/faculty/grade
router.put('/grade', authMiddleware, facultyOnly, async (req, res) => {
  try {
    const { studentId, courseId, letterGrade } = req.body;
    const grade = parseFloat(req.body.grade);
    if (isNaN(grade) || grade < 0 || grade > 100) {
      return res.status(400).json({ message: 'Grade must be a number between 0 and 100' });
    }
    const profile = await StudentProfile.findOne({ user: studentId });
    if (!profile) return res.status(404).json({ message: 'Student profile not found' });

    const existing = profile.grades.find(g => g.course?.toString() === courseId);
    if (existing) { existing.grade = grade; existing.letterGrade = letterGrade; }
    else           { profile.grades.push({ course: courseId, grade, letterGrade }); }

    const total = profile.grades.reduce((s, g) => s + g.grade, 0);
    profile.gpa = parseFloat((total / profile.grades.length / 25).toFixed(2));
    if (profile.gpa >= 3.5) profile.riskLevel = 'Low';
    else if (profile.gpa >= 2.5) profile.riskLevel = 'Medium';
    else profile.riskLevel = 'High';

    await profile.save();
    res.json({ message: 'Grade updated', profile });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;