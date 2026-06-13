const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gpa: { type: Number, default: 0 },
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  engagement: {
    loginFrequency:       { type: Number, default: 0 },
    assignmentsSubmitted: { type: Number, default: 0 },
    assignmentsMissed:    { type: Number, default: 0 },
    quizzesTaken:         { type: Number, default: 0 },
    quizzesMissed:        { type: Number, default: 0 },
  },
  studyHoursGoal: { type: Number, default: null }, // student-set study hours slider
  grades: [{
    course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    grade:       { type: Number },
    letterGrade: { type: String },
  }],
  chatHistory: [{
    role:      { type: String, enum: ['user', 'assistant'] },
    message:   { type: String },
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('StudentProfile', studentProfileSchema);