// ============================================================
//  FILE: backend/routes/chat.js
//  MOUNTED AT: /api/chat  (server.js line ~40)
//
//  ENDPOINTS & FEATURES:
//  ─────────────────────────────────────────────────────────
//  GET  /conversations            line ~63  – list all sessions for this student
//  POST /conversations            line ~74  – create new empty session
//  GET  /conversations/:id        line ~83  – load one session with messages
//
//  POST /conversations/:id/message line ~103 – SEND MESSAGE TO AI
//    1. buildStudentContext() injects the student's REAL academic data into
//       the Groq system prompt (GPA, risk, grades, pending deadlines).
//    2. Full conversation history sent to Groq on every call (stateless API).
//    3. Response saved to MongoDB ChatSession document.
//    4. If first message: auto-title generation fires (second Groq call).
//
//  DELETE /conversations/:id      line ~168 – delete a session
//
//  POST /upload                   line ~180 – FILE UPLOAD & TEXT EXTRACTION
//    PDF  → pdf2json (chosen over pdfjs-dist/pdf-parse: Node 22 compatible)
//    Word → mammoth (.docx → plain text)
//    Text → fs.readFileSync
//    Image → base64 passed directly to Groq (LLaMA 3.3 70B is multimodal)
//    Truncates at 15,000 chars before sending to Groq.
//
//  KEY FUNCTION:
//  buildStudentContext()          line ~17  – queries MongoDB for user + profile,
//    builds the system prompt with student name, GPA, courses, grades,
//    pending deadlines, engagement stats. Called fresh on every message.
//
//  MODEL: Groq LLaMA 3.3 70B (llama-3.3-70b-versatile)
//  GROQ_API_KEY set in backend/.env
// ============================================================

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const Conversation = require('../models/Conversation');
const Groq = require('groq-sdk');
const upload = require('../middleware/upload');
const fs = require('fs');
const PDFParser = require('pdf2json');
const mammoth = require('mammoth');
const path = require('path');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper to build student context
const buildStudentContext = async (userId) => {
  const user = await User.findById(userId).populate('enrolledCourses');
  const profile = await StudentProfile.findOne({ user: userId });

  const deadlines = [];
  user.enrolledCourses.forEach(course => {
    course.assignments?.forEach(assignment => {
      if (!assignment.submitted) {
        deadlines.push(`${assignment.title} (${course.name}) - Due: ${new Date(assignment.dueDate).toDateString()}`);
      }
    });
  });

  const grades = profile.grades.map(g => {
    const course = user.enrolledCourses.find(c => c._id.toString() === g.course?.toString());
    return `${course?.name ?? 'Unknown'}: ${g.letterGrade} (${g.grade}%)`;
  }).join(', ');

  const announcements = [];
  user.enrolledCourses.forEach(course => {
    course.announcements?.forEach(a => {
      announcements.push(`${a.title}: ${a.body} (${course.name})`);
    });
  });

  return {
    user,
    profile,
    systemPrompt: `You are AcadAI, a friendly and smart AI academic assistant for university students.
You are talking to ${user.name}, a student with ID ${user.studentId}.

Here is their current academic data:
- GPA: ${profile.gpa}
- Risk Level: ${profile.riskLevel}
- Enrolled Courses: ${user.enrolledCourses.map(c => `${c.name} (${c.code})`).join(', ')}
- Current Grades: ${grades}
- Pending Assignments: ${deadlines.join(' | ')}
- Announcements: ${announcements.join(' | ')}
- Engagement: ${profile.engagement.assignmentsMissed} assignments missed, ${profile.engagement.quizzesMissed} quizzes missed

Based on this data, answer the student's questions in a helpful, friendly and personalized way.
Keep responses concise and clear. Use emojis occasionally to be friendly.
If the student seems at risk, gently encourage them.`
  };
};

// @route GET /api/chat/conversations
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await Conversation.find({ user: req.userId })
      .sort({ updatedAt: -1 })
      .select('title createdAt updatedAt messages');
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/chat/conversations
router.post('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversation = await Conversation.create({
      user: req.userId,
      title: 'New Conversation',
      messages: [],
    });
    res.status(201).json(conversation);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route GET /api/chat/conversations/:id
router.get('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/chat/conversations/:id/message
router.post('/conversations/:id/message', authMiddleware, async (req, res) => {
  try {
    const { message, fileContext, fileName } = req.body;
    const { systemPrompt } = await buildStudentContext(req.userId);

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user: req.userId,
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    // Build message history for context
    const messageHistory = conversation.messages.map(m => ({
      role: m.role,
      content: m.text,
    }));

    // Add file context if provided
    let userMessageWithContext = message;
    if (fileContext) {
      userMessageWithContext = `[The student has uploaded a file: "${fileName}". Here is the content:\n\n${fileContext}\n\n]Student's question: ${message}`;
    }

    // Add new user message
    messageHistory.push({ role: 'user', content: userMessageWithContext });

    // Get AI response
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Save messages to conversation
    conversation.messages.push({ role: 'user', text: message });
    conversation.messages.push({ role: 'assistant', text: response });

    // Generate title if this is the first message
    if (conversation.messages.length === 2) {
      const titleCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: `Generate a very short title (4-6 words max) for a conversation that starts with this message: "${message}". Return ONLY the title, nothing else.`
          }
        ],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 20,
      });
      conversation.title = titleCompletion.choices[0]?.message?.content?.trim() || 'New Conversation';
    }

    await conversation.save();

    res.json({ response, title: conversation.title });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ message: 'Chat error', error: err.message });
  }
});

// @route DELETE /api/chat/conversations/:id
router.delete('/conversations/:id', authMiddleware, async (req, res) => {
  try {
    await Conversation.findOneAndDelete({ _id: req.params.id, user: req.userId });
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route POST /api/chat/upload
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    let extractedText = '';

    try {
      if (mimeType === 'application/pdf') {
        extractedText = await new Promise((resolve, reject) => {
          const pdfParser = new PDFParser();
          pdfParser.on('pdfParser_dataReady', (pdfData) => {
            try {
              const text = pdfData.Pages.map(page =>
                page.Texts.map(t => {
                  try {
                    return decodeURIComponent(t.R.map(r => r.T).join(''));
                  } catch {
                    return t.R.map(r => r.T).join('');
                  }
                }).join(' ')
              ).join('\n');
              resolve(text);
            } catch (err) {
              reject(err);
            }
          });
          pdfParser.on('pdfParser_dataError', reject);
          pdfParser.loadPDF(filePath);
        });
      } else if (
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (mimeType === 'text/plain') {
        extractedText = fs.readFileSync(filePath, 'utf8');
      } else if (mimeType.startsWith('image/')) {
        extractedText = '[Image uploaded - describe what you see in this image or ask questions about it]';
      }
    } finally {
      try { fs.unlinkSync(filePath); } catch {}
    }

    // Truncate if too long
    if (extractedText.length > 15000) {
      extractedText = extractedText.substring(0, 15000) + '...[content truncated]';
    }

    res.json({
      success: true,
      fileName: req.file.originalname,
      fileType: mimeType,
      extractedText,
      message: 'File processed successfully'
    });

  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ message: 'File processing error', error: err.message });
  }
});

module.exports = router;