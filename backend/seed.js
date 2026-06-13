const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const dotenv   = require('dotenv');
dotenv.config();

const User           = require('./models/User');
const Course         = require('./models/Course');
const StudentProfile = require('./models/StudentProfile');
const courseCatalog  = require('./config/courseCatalog');

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    await User.deleteMany({});
    await Course.deleteMany({});
    await StudentProfile.deleteMany({});
    console.log('🗑️  Cleared existing data');

    // ── Ahmed's custom courses (kept exactly as before) ─────────────────────
    const ahmedCourses = await Course.insertMany([
      {
        name: 'Data Structures & Algorithms', code: 'CS301',
        instructor: 'Dr. Ahmed Hassan', credits: 3,
        assignments: [
          { title: 'Linked List Implementation', dueDate: new Date('2026-06-10'), submitted: false },
          { title: 'Binary Tree Traversal',      dueDate: new Date('2026-06-17'), submitted: false },
          { title: 'Graph Algorithms Report',    dueDate: new Date('2026-05-30'), submitted: true  },
        ],
        announcements: [
          { title: 'Midterm Reminder', body: 'Midterm exam is on June 5th. Chapters 1–5 included.', date: new Date() },
          { title: 'Class Test',       body: 'Short quiz next Thursday covering stacks and queues.', date: new Date() },
        ],
      },
      {
        name: 'Database Systems', code: 'IS302',
        instructor: 'Dr. Nermin Othman', credits: 3,
        assignments: [
          { title: 'ER Diagram Design',    dueDate: new Date('2026-06-12'), submitted: false },
          { title: 'SQL Queries Practice', dueDate: new Date('2026-05-25'), submitted: true  },
          { title: 'Normalisation Task',   dueDate: new Date('2026-05-28'), submitted: true  },
        ],
        announcements: [
          { title: 'Project Submission', body: 'GP progress report due June 3rd.', date: new Date() },
          { title: 'Office Hours',       body: 'Extra office hours this week — Tue & Thu 2–4PM.', date: new Date() },
        ],
      },
      {
        name: 'Software Engineering', code: 'CS401',
        instructor: 'Dr. Sara Mostafa', credits: 3,
        assignments: [
          { title: 'Requirements Document', dueDate: new Date('2026-06-15'), submitted: false },
          { title: 'System Design Diagram', dueDate: new Date('2026-05-28'), submitted: true  },
        ],
        announcements: [
          { title: 'Guest Lecture', body: 'Industry guest lecture on June 7th at 2PM — attendance mandatory.', date: new Date() },
          { title: 'Final Exam',    body: 'Final exam on June 20th. Full syllabus covered.', date: new Date() },
        ],
      },
      {
        name: 'Computer Networks', code: 'CS305',
        instructor: 'Dr. Mohamed Ali', credits: 3,
        assignments: [
          { title: 'Network Topology Design', dueDate: new Date('2026-06-18'), submitted: false },
          { title: 'Packet Analysis Lab',     dueDate: new Date('2026-06-10'), submitted: false },
        ],
        announcements: [
          { title: 'Lab Session', body: 'Hands-on Wireshark lab this Saturday at 10AM.', date: new Date() },
        ],
      },
    ]);
    console.log('📚 Ahmed\'s courses created');

    // ── Ahmed (main student) ─────────────────────────────────────────────────
    const ahmed = await User.create({
      name: 'Ahmed Nasr', email: 'ahmed@acadai.com',
      password: await bcrypt.hash('ahmed123', 10),
      role: 'student', studentId: '237328',
      major: 'Information Systems', year: '4th Year', semester: 'Semester 2',
      enrolledCourses: ahmedCourses.map(c => c._id),
    });
    await StudentProfile.create({
      user: ahmed._id, gpa: 3.2, riskLevel: 'Medium',
      engagement: { loginFrequency: 4, assignmentsSubmitted: 6, assignmentsMissed: 2, quizzesTaken: 5, quizzesMissed: 2 },
      grades: [
        { course: ahmedCourses[0]._id, grade: 78, letterGrade: 'B'  },
        { course: ahmedCourses[1]._id, grade: 85, letterGrade: 'A-' },
        { course: ahmedCourses[2]._id, grade: 91, letterGrade: 'A'  },
        { course: ahmedCourses[3]._id, grade: 72, letterGrade: 'C+' },
      ],
      chatHistory: [],
    });
    console.log('👤 Ahmed created');

    // ── Faculty ──────────────────────────────────────────────────────────────
    await User.create({
      name: 'Dr. Nermin Othman', email: 'nermin@acadai.com',
      password: await bcrypt.hash('faculty123', 10),
      role: 'faculty', studentId: 'FAC001',
    });
    console.log('👩‍🏫 Faculty created');

    // ── Helper: get or create catalog courses ────────────────────────────────
    const courseCache = {};
    async function getCatalogCourses(major, year, semester) {
      const key = `${major}|${year}|${semester}`;
      if (courseCache[key]) return courseCache[key];
      const catalog = courseCatalog[major]?.[year]?.[semester] || [];
      const ids = [];
      for (const cd of catalog) {
        let c = await Course.findOne({ code: cd.code });
        if (!c) c = await Course.create({ name: cd.name, code: cd.code, instructor: cd.instructor, credits: cd.credits, assignments: [], announcements: [] });
        ids.push(c._id);
      }
      courseCache[key] = ids;
      return ids;
    }

    // ── 10 diverse extra students ────────────────────────────────────────────
    const extras = [
      {
        name: 'Sara El-Sayed',   email: 'sara@acadai.com',    studentId: '237001',
        major: 'Computer Science',      year: '3rd Year',  semester: 'Semester 1',
        gpa: 3.8, riskLevel: 'Low',
        eng: { loginFrequency: 22, assignmentsSubmitted: 8, assignmentsMissed: 0, quizzesTaken: 5, quizzesMissed: 0 },
        grades: [92, 88, 95, 85], letters: ['A', 'B+', 'A+', 'B+'],
      },
      {
        name: 'Omar Farouk',     email: 'omar@acadai.com',    studentId: '237002',
        major: 'Information Systems',   year: '2nd Year',  semester: 'Semester 2',
        gpa: 1.6, riskLevel: 'High',
        eng: { loginFrequency: 3, assignmentsSubmitted: 2, assignmentsMissed: 5, quizzesTaken: 1, quizzesMissed: 4 },
        grades: [42, 51, 38, 55], letters: ['F', 'D', 'F', 'D'],
      },
      {
        name: 'Nour Ashraf',     email: 'nour@acadai.com',    studentId: '237003',
        major: 'Software Engineering',  year: '1st Year',  semester: 'Semester 2',
        gpa: 2.9, riskLevel: 'Medium',
        eng: { loginFrequency: 9, assignmentsSubmitted: 5, assignmentsMissed: 2, quizzesTaken: 3, quizzesMissed: 2 },
        grades: [70, 65, 72, 68], letters: ['B-', 'C+', 'B-', 'C+'],
      },
      {
        name: 'Karim Mansour',   email: 'karim@acadai.com',   studentId: '237004',
        major: 'Computer Science',      year: '4th Year',  semester: 'Semester 1',
        gpa: 3.5, riskLevel: 'Low',
        eng: { loginFrequency: 18, assignmentsSubmitted: 7, assignmentsMissed: 1, quizzesTaken: 4, quizzesMissed: 1 },
        grades: [88, 82, 90, 85], letters: ['B+', 'B', 'A-', 'B+'],
      },
      {
        name: 'Yasmine Khaled',  email: 'yasmine@acadai.com', studentId: '237005',
        major: 'Information Systems',   year: '3rd Year',  semester: 'Semester 2',
        gpa: 2.2, riskLevel: 'High',
        eng: { loginFrequency: 5, assignmentsSubmitted: 3, assignmentsMissed: 4, quizzesTaken: 2, quizzesMissed: 3 },
        grades: [55, 48, 60, 52], letters: ['D', 'F', 'C-', 'D'],
      },
      {
        name: 'Hassan Tarek',    email: 'hassan@acadai.com',  studentId: '237006',
        major: 'Software Engineering',  year: '2nd Year',  semester: 'Semester 1',
        gpa: 3.1, riskLevel: 'Medium',
        eng: { loginFrequency: 11, assignmentsSubmitted: 6, assignmentsMissed: 1, quizzesTaken: 4, quizzesMissed: 1 },
        grades: [75, 78, 72, 80], letters: ['B', 'B', 'B-', 'B'],
      },
      {
        name: 'Layla Mostafa',   email: 'layla@acadai.com',   studentId: '237007',
        major: 'Computer Science',      year: '1st Year',  semester: 'Semester 1',
        gpa: 3.95, riskLevel: 'Low',
        eng: { loginFrequency: 25, assignmentsSubmitted: 8, assignmentsMissed: 0, quizzesTaken: 5, quizzesMissed: 0 },
        grades: [97, 94, 96, 92], letters: ['A+', 'A', 'A+', 'A'],
      },
      {
        name: 'Youssef Ibrahim', email: 'youssef@acadai.com', studentId: '237008',
        major: 'Information Systems',   year: '4th Year',  semester: 'Semester 2',
        gpa: 2.6, riskLevel: 'Medium',
        eng: { loginFrequency: 8, assignmentsSubmitted: 5, assignmentsMissed: 2, quizzesTaken: 3, quizzesMissed: 2 },
        grades: [66, 70, 63, 68], letters: ['C+', 'B-', 'C', 'C+'],
      },
      {
        name: 'Dina Ramadan',    email: 'dina@acadai.com',    studentId: '237009',
        major: 'Software Engineering',  year: '3rd Year',  semester: 'Semester 1',
        gpa: 1.2, riskLevel: 'High',
        eng: { loginFrequency: 2, assignmentsSubmitted: 1, assignmentsMissed: 7, quizzesTaken: 0, quizzesMissed: 5 },
        grades: [32, 40, 28, 35], letters: ['F', 'F', 'F', 'F'],
      },
      {
        name: 'Amr Shalaby',     email: 'amr@acadai.com',     studentId: '237010',
        major: 'Computer Science',      year: '2nd Year',  semester: 'Semester 2',
        gpa: 3.3, riskLevel: 'Low',
        eng: { loginFrequency: 14, assignmentsSubmitted: 7, assignmentsMissed: 1, quizzesTaken: 5, quizzesMissed: 0 },
        grades: [82, 79, 85, 80], letters: ['B', 'B', 'B+', 'B'],
      },
    ];

    const pw = await bcrypt.hash('student123', 10);
    for (const s of extras) {
      const courseIds = await getCatalogCourses(s.major, s.year, s.semester);
      const user = await User.create({
        name: s.name, email: s.email, password: pw,
        studentId: s.studentId, role: 'student',
        major: s.major, year: s.year, semester: s.semester,
        enrolledCourses: courseIds,
      });
      await StudentProfile.create({
        user: user._id, gpa: s.gpa, riskLevel: s.riskLevel,
        engagement: s.eng,
        grades: s.grades.map((g, i) => ({ course: courseIds[i] || courseIds[0], grade: g, letterGrade: s.letters[i] })),
        chatHistory: [],
      });
      console.log(`   ✅ ${s.name}  (${s.major.split(' ')[0]} · ${s.year} · GPA ${s.gpa} · ${s.riskLevel})`);
    }
    console.log('👥 10 extra students created');

    console.log('\n🎉 Database seeded successfully!');
    console.log('────────────────────────────────────────────');
    console.log('Main student  →  ahmed@acadai.com   / ahmed123');
    console.log('Faculty       →  nermin@acadai.com  / faculty123');
    console.log('Extra students password: student123');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
};

seedDatabase();
