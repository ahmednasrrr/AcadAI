// ============================================================
//  FILE: backend/routes/student.js
//  MOUNTED AT: /api/student  (server.js line ~30)
//
//  ENDPOINTS & FEATURES:
//  ─────────────────────────────────────────────────────────
//  GET  /dashboard            line ~73   – DASHBOARD LOAD
//    Fetches student from MongoDB, calls Flask /predict-dynamic,
//    /predict-cluster, /explain in parallel → returns one combined response.
//    This is the main ML orchestration point.
//
//  PUT  /mark-assignment      line ~120  – MARK ASSIGNMENT DONE
//    Updates MongoDB, recalculates engagement metrics, calls Flask with
//    include_shap:true so the SHAP chart updates live on the dashboard.
//
//  PUT  /study-hours          line ~157  – STUDY HOURS SLIDER
//    Saves new goal, calls Flask with include_shap:true → live grade/risk/stress.
//    Debounced 600ms on the frontend before this fires.
//
//  POST /study-plan           line ~173  – AI WEEKLY STUDY PLAN (Groq)
//    Builds ML context (risk, grade, cluster, pending assignments),
//    calls Groq LLaMA 3.3 70B with structured prompt.
//    Optional: target_grade + required_hours focus the plan on a goal.
//
//  POST /whatif               line ~242  – WHAT-IF CALCULATOR
//    Runs 40 parallel Flask /predict-dynamic calls (1h–40h study hours).
//    Returns grade curve + minimum hours to reach target_grade.
//    No artificial cap — searches the full realistic weekly range.
//
//  HELPER FUNCTIONS (top of file):
//  buildPayload()             line ~16   – converts MongoDB profile → Flask feature vector
//  getRiskPrediction()        line ~27   – calls Flask /predict
//  getGradePrediction()       line ~35   – calls Flask /predict-grade
//  getClusterPrediction()     line ~49   – calls Flask /predict-cluster
//  getShapExplanation()       line ~58   – calls Flask /explain
//  getDynamicPredictions()    line ~65   – calls Flask /predict-dynamic
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const Groq    = require('groq-sdk');
const authMiddleware = require('../middleware/auth');
const User           = require('../models/User');
const Course         = require('../models/Course');
const StudentProfile = require('../models/StudentProfile');

const ML   = 'http://127.0.0.1:5001';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const calculateAverageGrade = (grades) => {
  if (!grades || grades.length === 0) return 0;
  return Math.round(grades.reduce((sum, g) => sum + g.grade, 0) / grades.length);
};

const buildPayload = (profile) => ({
  gpa:                  profile.gpa                           || 0,
  assignments_submitted: profile.engagement?.assignmentsSubmitted || 0,
  assignments_missed:   profile.engagement?.assignmentsMissed    || 0,
  quizzes_taken:        profile.engagement?.quizzesTaken         || 0,
  quizzes_missed:       profile.engagement?.quizzesMissed        || 0,
  login_frequency:      profile.engagement?.loginFrequency       || 0,
  average_grade:        calculateAverageGrade(profile.grades),
});

// ── ML helpers ────────────────────────────────────────────────
const getRiskPrediction = async (profile) => {
  try {
    const r = await axios.post(`${ML}/predict`, buildPayload(profile));
    return { riskLevel: r.data.risk_level, reasons: r.data.reasons,
             suggestions: r.data.suggestions, confidence: r.data.confidence };
  } catch { return { riskLevel: profile.riskLevel || 'Low', reasons: [], suggestions: [], confidence: {} }; }
};

const getGradePrediction = async (profile) => {
  try {
    const r = await axios.post(`${ML}/predict-grade`, buildPayload(profile));
    return { predicted_grade: r.data.predicted_grade, predicted_letter: r.data.predicted_letter };
  } catch { return { predicted_grade: null, predicted_letter: null }; }
};

const getStudyTimePrediction = async (profile) => {
  try {
    const r = await axios.post(`${ML}/predict-studytime`, buildPayload(profile));
    return r.data;
  } catch { return { recommended_studytime: 10, hours_per_week: '10 hrs/week', label: 'Moderate', color: '#fbbf24' }; }
};

const getClusterPrediction = async (profile) => {
  try {
    const r = await axios.post(`${ML}/predict-cluster`, buildPayload(profile));
    return r.data;
  } catch { return { cluster_name: 'Balanced Performer', description: 'Solid performance.',
                     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',
                     advice: 'Keep going!', learning_style: 'Blended Learning', percentage: 20, all_clusters: [] }; }
};

const getShapExplanation = async (profile) => {
  try {
    const r = await axios.post(`${ML}/explain`, buildPayload(profile));
    return r.data;
  } catch { return { contributions: [] }; }
};

const getDynamicPredictions = async (payload) => {
  try {
    const r = await axios.post(`${ML}/predict-dynamic`, payload);
    return r.data;
  } catch { return null; }
};

// ── Dashboard route ───────────────────────────────────────────
// FEATURE: Dashboard Load — orchestrates MongoDB + Flask in one response
// The student never waits for multiple round trips: Node assembles everything.
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const user    = await User.findById(req.userId).populate('enrolledCourses');
    const profile = await StudentProfile.findOne({ user: req.userId }).populate('grades.course');
    if (!user)    return res.status(404).json({ message: 'User not found' });
    if (!profile) return res.status(404).json({ message: 'Student profile not found' });

    const [mlResult, gradePrediction, clusterPrediction, shapExplanation] =
      await Promise.all([
        getRiskPrediction(profile),
        getGradePrediction(profile),
        getClusterPrediction(profile),
        getShapExplanation(profile),
      ]);

    if (mlResult.riskLevel !== profile.riskLevel) {
      profile.riskLevel = mlResult.riskLevel;
      await profile.save();
    }

    res.json({
      user, profile,
      mlInsights:        { riskLevel: mlResult.riskLevel, reasons: mlResult.reasons,
                           suggestions: mlResult.suggestions, confidence: mlResult.confidence },
      gradePrediction:   { predicted_grade: gradePrediction.predicted_grade,
                           predicted_letter: gradePrediction.predicted_letter },
      clusterPrediction: { cluster_name: clusterPrediction.cluster_name,
                           description: clusterPrediction.description,
                           color: clusterPrediction.color, bg: clusterPrediction.bg,
                           advice: clusterPrediction.advice,
                           learning_style: clusterPrediction.learning_style,
                           percentage: clusterPrediction.percentage,
                           all_clusters: clusterPrediction.all_clusters || [] },
      shapExplanation:   { contributions: shapExplanation.contributions || [],
                           target_class: shapExplanation.target_class },
      studyHoursGoal:    profile.studyHoursGoal || null,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Mark assignment done ──────────────────────────────────────
// FEATURE: Dynamic Dashboard — mark-done triggers live ML recalculation
// Updates MongoDB, re-builds engagement metrics, calls Flask with SHAP.
// The SHAP chart on the dashboard updates to reflect the new submission state.
router.put('/mark-assignment', authMiddleware, async (req, res) => {
  try {
    const { submitted, courseId, assignmentId } = req.body;
    const profile = await StudentProfile.findOne({ user: req.userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    if (submitted) {
      profile.engagement.assignmentsMissed    = Math.max(0, (profile.engagement.assignmentsMissed || 0) - 1);
      profile.engagement.assignmentsSubmitted = (profile.engagement.assignmentsSubmitted || 0) + 1;
    } else {
      profile.engagement.assignmentsMissed    = (profile.engagement.assignmentsMissed || 0) + 1;
      profile.engagement.assignmentsSubmitted = Math.max(0, (profile.engagement.assignmentsSubmitted || 0) - 1);
    }
    await profile.save();

    if (courseId && assignmentId) {
      try {
        const course = await Course.findById(courseId);
        if (course) {
          const assign = course.assignments.id(assignmentId);
          if (assign) { assign.submitted = submitted; await course.save(); }
        }
      } catch (e) { console.error('Course update error:', e.message); }
    }

    const payload = { ...buildPayload(profile), study_hours: profile.studyHoursGoal || null, include_shap: true };
    const dynamic = await getDynamicPredictions(payload);
    if (dynamic?.risk?.risk_level && dynamic.risk.risk_level !== profile.riskLevel) {
      profile.riskLevel = dynamic.risk.risk_level; await profile.save();
    }
    res.json({ engagement: profile.engagement, predictions: dynamic });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── Update study hours goal ───────────────────────────────────
// FEATURE: Study Planner slider — debounced on frontend (600ms), fires here
// include_shap:true means the SHAP breakdown also updates live with the slider.
router.put('/study-hours', authMiddleware, async (req, res) => {
  try {
    const { hours } = req.body;
    const profile   = await StudentProfile.findOne({ user: req.userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    profile.studyHoursGoal = hours;
    await profile.save();
    const payload = { ...buildPayload(profile), study_hours: hours, include_shap: true };
    const dynamic = await getDynamicPredictions(payload);
    if (dynamic?.risk?.risk_level && dynamic.risk.risk_level !== profile.riskLevel) {
      profile.riskLevel = dynamic.risk.risk_level; await profile.save();
    }
    res.json({ studyHoursGoal: hours, predictions: dynamic });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ── AI Weekly Study Plan ──────────────────────────────────────
// FEATURE: AI Study Plan Generator
// Collects ML context (risk, grade, cluster, pending assignments) then calls
// Groq LLaMA 3.3 70B with a structured prompt → returns 7-day JSON plan.
// If target_grade is provided (from What-If Calculator), the plan is tailored
// specifically to helping the student reach that goal.
router.post('/study-plan', authMiddleware, async (req, res) => {
  try {
    const user    = await User.findById(req.userId).populate('enrolledCourses');
    const profile = await StudentProfile.findOne({ user: req.userId });
    if (!user || !profile) return res.status(404).json({ message: 'User not found' });

    const [mlResult, gradePrediction, studyTimePrediction, clusterPrediction] = await Promise.all([
      getRiskPrediction(profile),
      getGradePrediction(profile),
      getStudyTimePrediction(profile),
      getClusterPrediction(profile),
    ]);

    const { target_grade, required_hours } = req.body;

    const pending = [];
    user.enrolledCourses?.forEach(c => {
      c.assignments?.forEach(a => {
        if (!a.submitted) pending.push(`${a.title} (${c.name})`);
      });
    });

    const goalLine = target_grade
      ? `\nGOAL: The student wants to reach ${target_grade}%.${required_hours ? ` Our model estimates this needs about ${required_hours} hrs/week of study.` : ' Reaching it will require strong study habits plus consistent attendance and on-time assignments.'} Build the plan specifically around hitting this goal, and weight the daily hours toward it.`
      : '';

    const prompt = `You are an academic advisor for AcadAI. Create a practical 7-day study plan for this student.

Student: ${user.name}, ${user.major}, Year ${user.year}
Academic Risk: ${mlResult.riskLevel}
Risk Reasons: ${mlResult.reasons?.join('; ') || 'None'}
Predicted Grade: ${gradePrediction.predicted_grade}% (${gradePrediction.predicted_letter})
Recommended Study: ${studyTimePrediction.recommended_studytime} hrs/week
Learning Profile: ${clusterPrediction.cluster_name} → ${clusterPrediction.learning_style}
Pending Assignments: ${pending.length > 0 ? pending.slice(0, 5).join(', ') : 'None currently'}${goalLine}

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "overview": "2-sentence personalized summary mentioning the student's name${target_grade ? ` and how this plan helps them reach their ${target_grade}% goal` : ' and their main academic situation'}",
  "days": [
    { "day": "Monday", "focus": "specific subject or topic to study", "hours": 2, "tasks": ["specific task 1", "specific task 2"] },
    { "day": "Tuesday", "focus": "...", "hours": 2, "tasks": ["..."] },
    { "day": "Wednesday", "focus": "...", "hours": 2, "tasks": ["..."] },
    { "day": "Thursday", "focus": "...", "hours": 2, "tasks": ["..."] },
    { "day": "Friday", "focus": "...", "hours": 2, "tasks": ["..."] },
    { "day": "Saturday", "focus": "...", "hours": 3, "tasks": ["..."] },
    { "day": "Sunday", "focus": "Rest & Review", "hours": 1, "tasks": ["Review the week's material", "Prepare for next week"] }
  ],
  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 1400,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      plan = JSON.parse(raw.replace(/```json|```/g, '').trim());
    }

    res.json({ plan, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Study plan error:', err);
    res.status(500).json({ message: 'Failed to generate plan', error: err.message });
  }
});

// ── Grade What-If Calculator ──────────────────────────────────
// FEATURE: What-If Calculator (Study Planner → "Reach a goal" mode)
// Fires 40 parallel Flask calls (study_hours 1→40), finds the minimum hours
// to reach target_grade. Returns full curve + required point + max achievable.
// No cap: searches the real weekly range, not limited to 20h.
router.post('/whatif', authMiddleware, async (req, res) => {
  try {
    const { target_grade = 75 } = req.body;
    const profile = await StudentProfile.findOne({ user: req.userId });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const base = buildPayload(profile);

    // Search the full realistic weekly study range (1–40 h) — no artificial cap
    const MAX_HOURS = 40;
    const hours = Array.from({ length: MAX_HOURS }, (_, i) => i + 1);
    const results = await Promise.all(
      hours.map(h => getDynamicPredictions({ ...base, study_hours: h }).catch(() => null))
    );

    const curve = results
      .map((r, i) => ({
        hours:  i + 1,
        grade:  r?.grade?.predicted_grade  ?? null,
        letter: r?.grade?.predicted_letter ?? null,
        risk:   r?.risk?.risk_level        ?? null,
      }))
      .filter(r => r.grade !== null);

    const hit           = curve.find(r => r.grade >= target_grade);
    const maxAchievable = curve.reduce((best, r) => (r.grade > (best?.grade ?? 0) ? r : best), null);

    res.json({ target_grade, curve, required: hit || null, max_achievable: maxAchievable, max_hours: MAX_HOURS });
  } catch (err) {
    console.error('What-if error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;