const courseCatalog = {
    'Information Systems': {
      '1st Year': {
        'Semester 1': [
          { name: 'Introduction to Programming', code: 'IS-CS101', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mathematics for Computing', code: 'MATH101', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Introduction to Information Systems', code: 'IS101', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'English for Academic Purposes', code: 'ENG101', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
        'Semester 2': [
          { name: 'Object Oriented Programming', code: 'IS-CS102', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Discrete Mathematics', code: 'MATH102', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Computer Organization', code: 'IS102', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Technical Writing', code: 'ENG102', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
      '2nd Year': {
        'Semester 1': [
          { name: 'Data Structures & Algorithms', code: 'IS-CS201', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Database Fundamentals', code: 'IS201', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Web Development Basics', code: 'IS202', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Statistics', code: 'MATH201', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
        'Semester 2': [
          { name: 'Advanced Databases', code: 'IS203', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Systems Analysis & Design', code: 'IS204', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Human Computer Interaction', code: 'IS205', credits: 3, instructor: 'Dr. Layla Ibrahim' },
          { name: 'Probability Theory', code: 'MATH202', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
      },
      '3rd Year': {
        'Semester 1': [
          { name: 'Software Engineering', code: 'IS-CS301', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Computer Networks', code: 'IS-CS302', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Information Security', code: 'IS301', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Data Mining', code: 'IS302', credits: 3, instructor: 'Dr. Nermin Othman' },
        ],
        'Semester 2': [
          { name: 'Enterprise Systems', code: 'IS303', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Mobile Application Development', code: 'IS304', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Business Intelligence', code: 'IS305', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Project Management', code: 'IS306', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
      '4th Year': {
        'Semester 1': [
          { name: 'Graduation Project I', code: 'IS401', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'AI & Machine Learning', code: 'IS402', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Cloud Computing', code: 'IS403', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'IT Governance', code: 'IS404', credits: 2, instructor: 'Dr. Sara Mostafa' },
        ],
        'Semester 2': [
          { name: 'Graduation Project II', code: 'IS405', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Enterprise Architecture', code: 'IS406', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'IT Strategy', code: 'IS407', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Professional Ethics in IT', code: 'IS408', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
    },
  
    'Computer Science': {
      '1st Year': {
        'Semester 1': [
          { name: 'Introduction to Programming', code: 'CS101', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mathematics I', code: 'MATH101', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Discrete Mathematics', code: 'CS102', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'English for Academic Purposes', code: 'ENG101', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
        'Semester 2': [
          { name: 'Object Oriented Programming', code: 'CS103', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mathematics II', code: 'MATH102', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Digital Logic Design', code: 'CS104', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Technical Writing', code: 'ENG102', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
      '2nd Year': {
        'Semester 1': [
          { name: 'Data Structures', code: 'CS201', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Algorithms', code: 'CS202', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Computer Organization', code: 'CS203', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Statistics', code: 'MATH201', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
        'Semester 2': [
          { name: 'Operating Systems', code: 'CS204', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Database Systems', code: 'CS205', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Software Engineering', code: 'CS206', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Probability Theory', code: 'MATH202', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
      },
      '3rd Year': {
        'Semester 1': [
          { name: 'Computer Networks', code: 'CS301', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Artificial Intelligence', code: 'CS302', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Theory of Computation', code: 'CS303', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Numerical Methods', code: 'MATH301', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
        'Semester 2': [
          { name: 'Compiler Design', code: 'CS304', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Computer Graphics', code: 'CS305', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Distributed Systems', code: 'CS306', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Linear Algebra', code: 'MATH302', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
      },
      '4th Year': {
        'Semester 1': [
          { name: 'Graduation Project I', code: 'CS401', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Machine Learning', code: 'CS402', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Information Security', code: 'CS403', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Advanced Algorithms', code: 'CS404', credits: 3, instructor: 'Dr. Mohamed Ali' },
        ],
        'Semester 2': [
          { name: 'Graduation Project II', code: 'CS405', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Cloud Computing', code: 'CS406', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Computer Vision', code: 'CS407', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Professional Ethics', code: 'CS408', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
    },
  
    'Software Engineering': {
      '1st Year': {
        'Semester 1': [
          { name: 'Introduction to Programming', code: 'SE101', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mathematics I', code: 'MATH101', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Introduction to Software Engineering', code: 'SE102', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'English for Academic Purposes', code: 'ENG101', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
        'Semester 2': [
          { name: 'Object Oriented Programming', code: 'SE103', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mathematics II', code: 'MATH102', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Computer Organization', code: 'SE104', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Technical Writing', code: 'ENG102', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
      '2nd Year': {
        'Semester 1': [
          { name: 'Data Structures', code: 'SE201', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Web Development', code: 'SE202', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Database Systems', code: 'SE203', credits: 3, instructor: 'Dr. Nermin Othman' },
          { name: 'Statistics', code: 'MATH201', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
        'Semester 2': [
          { name: 'Software Requirements Engineering', code: 'SE204', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Software Design Patterns', code: 'SE205', credits: 3, instructor: 'Dr. Ahmed Hassan' },
          { name: 'Mobile Development', code: 'SE206', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Probability Theory', code: 'MATH202', credits: 3, instructor: 'Dr. Sara Mostafa' },
        ],
      },
      '3rd Year': {
        'Semester 1': [
          { name: 'Software Architecture', code: 'SE301', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Software Testing & QA', code: 'SE302', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'DevOps & CI/CD', code: 'SE303', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Computer Networks', code: 'SE304', credits: 3, instructor: 'Dr. Mohamed Ali' },
        ],
        'Semester 2': [
          { name: 'Agile Methodologies', code: 'SE305', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Software Project Management', code: 'SE306', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Information Security', code: 'SE307', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Human Computer Interaction', code: 'SE308', credits: 3, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
      '4th Year': {
        'Semester 1': [
          { name: 'Graduation Project I', code: 'SE401', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Cloud Computing', code: 'SE402', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Microservices Architecture', code: 'SE403', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'AI for Software Engineers', code: 'SE404', credits: 3, instructor: 'Dr. Ahmed Hassan' },
        ],
        'Semester 2': [
          { name: 'Graduation Project II', code: 'SE405', credits: 3, instructor: 'Dr. Sara Mostafa' },
          { name: 'Software Maintenance', code: 'SE406', credits: 3, instructor: 'Dr. Khaled Samir' },
          { name: 'Blockchain Development', code: 'SE407', credits: 3, instructor: 'Dr. Mohamed Ali' },
          { name: 'Professional Ethics', code: 'SE408', credits: 2, instructor: 'Dr. Layla Ibrahim' },
        ],
      },
    },
  };
  
  module.exports = courseCatalog;