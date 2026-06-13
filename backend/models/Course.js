const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  instructor: { type: String, required: true },
  credits: { type: Number, required: true },
  assignments: [{
    title: { type: String },
    dueDate: { type: Date },
    submitted: { type: Boolean, default: false },
  }],
  announcements: [{
    title: { type: String },
    body: { type: String },
    date: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);