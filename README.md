# AcadAI — AI-Powered Academic Support System

AcadAI is a full-stack web application that uses machine learning to help university students monitor their academic performance, predict risks, and get personalised guidance. Faculty can manage courses, assess students, and generate AI-powered assessments.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Machine Learning Models](#machine-learning-models)
- [Dataset](#dataset)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Demo Credentials](#demo-credentials)
- [API Endpoints](#api-endpoints)
- [ML API Endpoints](#ml-api-endpoints)

---

## Overview

AcadAI addresses a real gap in academic support systems — most platforms show grades but offer no predictive insight or personalised guidance. AcadAI combines:

- **Supervised ML** (risk prediction, grade prediction, study time recommendation)
- **Unsupervised ML** (student clustering for learning style recommendations)
- **Explainable AI** (SHAP feature contributions)
- **Generative AI** (LLaMA 3.3 70B via Groq for chat, study plans, and assessment generation)

---

## Features

### Student Side
| Feature | Description |
|---|---|
| **Academic Dashboard** | Real-time risk level, predicted grade, stress indicator, engagement score |
| **Study Planner** | Slider adjusts weekly study hours → ML recalculates predictions live |
| **What-If Calculator** | Set a target grade → get the required study hours |
| **SHAP Explainability** | See exactly which factors are driving your risk level |
| **AI Chat Assistant** | Context-aware chat powered by LLaMA 3.3 70B with file upload (PDF, Word, images) |
| **Courses & Assignments** | View enrolled courses, mark assignments done, track pending work |
| **Grades** | Per-course grade display with predicted final grades |
| **Learning Style Profile** | K-Means cluster profile with personalised learning style recommendation |

### Faculty Side
| Feature | Description |
|---|---|
| **Student Dashboard** | Table of all students with risk level, GPA, engagement metrics |
| **Risk Distribution Chart** | Pie chart of High / Medium / Low risk distribution |
| **AI Analyst** | Natural language Q&A over student data |
| **Assessment Generator** | Generate MCQ, True/False, short answer, essay questions by topic and difficulty |
| **Grade Management** | Update student grades → GPA and risk level recalculate automatically |
| **Course Management** | Add courses, post announcements |

---

## System Architecture

```
User Browser (React :3000)
        │
        ▼
Node.js / Express Backend (:5000)
        │
        ├──► MongoDB Atlas          (users, courses, profiles, conversations)
        ├──► Flask ML API (:5001)   (risk, grade, study time, clustering, SHAP)
        └──► Groq API               (LLaMA 3.3 70B — chat, study plans, assessments)
```

**Data flow for a student dashboard load:**
1. React calls `GET /api/student/dashboard`
2. Node queries MongoDB for user profile, courses, grades
3. Node calls Flask `/predict`, `/predict-grade`, `/predict-cluster`, `/explain` in parallel
4. Node calls Groq to generate a personalised study plan
5. All results assembled into one response → React renders dashboard

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19, React Router, Recharts, Axios | SPA, routing, charts, HTTP |
| Backend | Node.js, Express 5, Mongoose, JWT, bcryptjs | REST API, auth, DB access |
| Database | MongoDB Atlas | Users, courses, profiles, conversations |
| ML API | Python, Flask, scikit-learn, SHAP, pandas, numpy | Predictive models |
| LLM | Groq SDK (LLaMA 3.3 70B) | Chat, study plans, assessments |
| File Parsing | pdf2json, mammoth, multer | PDF, Word, image upload in chat |

---

## Machine Learning Models

### 1. Risk Prediction (Classification)
- **Algorithm:** Soft-voting ensemble — Gradient Boosting + ExtraTrees + Logistic Regression
- **Why ensemble:** No single model consistently handled the class imbalance
- **Class imbalance fix:** SMOTE applied inside the cross-validation pipeline (prevents leakage)
- **Threshold tuning:** P(High) ≥ 0.35 → flag as High risk (optimised for recall, not accuracy)
- **Test Accuracy:** 87.9% | **Balanced Accuracy:** 89.9% | **High-risk Recall:** 0.82
- **Labels:** High / Medium / Low (derived from ExamScore thresholds — no explicit label in dataset)

### 2. Grade Prediction (Regression)
- **Algorithm:** HistGradientBoostingRegressor with monotonic constraint on StudyHours
- **Why monotonic:** Dataset has r≈0.004 study↔grade correlation (variance collapse from merge). Unconstrained model learned a spurious negative slope. Constraint ensures more study never lowers predicted grade.
- **Final model:** 70% anchored on student's real average grade + 30% ML behavioural estimate + diminishing-returns effort curve
- **R²:** 0.35 (limited by dataset; compensated by blended approach)

### 3. Study Time Recommendation (Regression)
- **Algorithm:** GradientBoostingRegressor
- **Output:** Recommended weekly study hours based on engagement signals

### 4. Student Clustering (Unsupervised)
- **Algorithm:** K-Means (k=6)
- **Features:** StudyHours, Attendance, AssignmentCompletion, ExamScore, StressLevel, OnlineCourses, Discussions
- **Silhouette score:** 0.11 (low but expected — educational data is continuous with no sharp natural clusters)
- **Profiles:** Stressed Achiever, Balanced Performer, Struggling Student
- **Purpose:** Learning style recommendation, not hard classification

### 5. SHAP Explainability
- **Method:** TreeExplainer on the ExtraTrees component of the ensemble
- **Why ExtraTrees:** sklearn's TreeExplainer does not support multiclass GradientBoostingClassifier
- **Output:** Per-feature contributions showing what is driving each student's risk level

---

## Dataset

| Property | Value |
|---|---|
| **Source** | Zenodo — DOI: 10.5281/zenodo.16459132 |
| **Size** | 14,003 students |
| **Features** | 16 (StudyHours, Attendance, AssignmentCompletion, ExamScore, StressLevel, OnlineCourses, Discussions, Motivation, FinalGrade, Resources, Extracurricular, Internet, EduTech, EngagementScore, BehavioralRisk, ResourceQuality) |
| **Risk label** | Derived: ExamScore < 55 → High, < 70 → Medium, ≥ 70 → Low |
| **Class balance** | Imbalanced → fixed with SMOTE |

---

## Project Structure

```
acadai/
├── backend/
│   ├── config/
│   │   └── courseCatalog.js       Course catalog (3 majors × 4 years)
│   ├── middleware/
│   │   ├── auth.js                JWT verification + role guard
│   │   └── upload.js              Multer file upload config
│   ├── models/
│   │   ├── User.js                User schema (student / faculty)
│   │   ├── Course.js              Course schema (assignments, announcements)
│   │   ├── StudentProfile.js      Profile schema (GPA, risk, grades, engagement)
│   │   └── Conversation.js        Chat session schema
│   ├── routes/
│   │   ├── auth.js                Register, Login
│   │   ├── student.js             Dashboard, Study Planner, What-If
│   │   ├── chat.js                AI Chat + file upload
│   │   └── faculty.js             Faculty portal + AI analyst + assessments
│   ├── .env                       Environment variables (not committed)
│   ├── .env.example               Template for .env
│   ├── server.js                  Express entry point
│   └── seed.js                    Database seeder (demo data)
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.js/css   Student dashboard + Study Planner
│       │   ├── Chat.js/css        AI chat assistant
│       │   ├── Courses.js/css     Courses + assignments
│       │   ├── Grades.js/css      Grades + predictions
│       │   ├── Faculty.js/css     Faculty portal
│       │   ├── Login.js/css
│       │   └── Register.js/css
│       ├── App.js                 Router + auth guards
│       └── index.js               React entry point
│
├── ml/
│   ├── app.py                     Flask ML API (7 endpoints)
│   ├── ml_models.py               ThresholdedEnsemble class
│   ├── train_all_merged.py        Trains risk + grade + study time models
│   ├── train_kmeans_merged.py     Trains K-Means clustering model
│   ├── compare_algorithms.py      Algorithm benchmarking study
│   ├── confusion_matrix.py        Confusion matrix visualisation
│   ├── generate_dataset.py        Synthetic data generator (dev only)
│   ├── merged_dataset.csv         Training data (14,003 students)
│   ├── requirements.txt           Python dependencies
│   ├── m_risk.pkl                 Deployed risk model
│   ├── m_grade.pkl                Deployed grade model
│   ├── m_studytime.pkl            Deployed study time model
│   ├── merged_kmeans.pkl          Deployed clustering model
│   ├── merged_scaler.pkl          StandardScaler for clustering
│   ├── merged_labels.pkl          Cluster metadata
│   ├── merged_features.pkl        Feature list for clustering
│   ├── m_risk_features.pkl        Feature list for risk model
│   ├── m_grade_features.pkl       Feature list for grade model
│   ├── m_studytime_features.pkl   Feature list for study time model
│   ├── m_risk_encoder.pkl         Label encoder for risk classes
│   ├── curve_risk.png             Risk model learning curve
│   ├── curve_grade.png            Grade model learning curve
│   ├── curve_studytime.png        Study time model learning curve
│   └── curve_kmeans.png           K-Means silhouette sweep plot
│
├── .gitignore
├── AcadAI_Project_Summary.md
├── AcadAI_Development_Log.md
└── README.md
```

---

## Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- MongoDB Atlas account (or use the existing URI in .env)

### 1. Clone the repository
```bash
git clone <repo-url>
cd acadai
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill in your values in .env
npm run dev
# Runs on http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

### 4. ML API
```bash
cd ml
pip install -r requirements.txt
python app.py
# Runs on http://localhost:5001
```

### 5. Seed demo data (first time only)
```bash
cd backend
node seed.js
```

### 6. Retrain models (optional — pre-trained .pkl files are included)
```bash
cd ml
python train_all_merged.py       # Risk + Grade + Study Time (~10 min)
python train_kmeans_merged.py    # K-Means clustering (~2 min)
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Student | ahmed@acadai.com | ahmed123 |
| Faculty | nermin@acadai.com | faculty123 |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login + receive JWT |

### Student
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/student/dashboard` | Full dashboard data + ML predictions |
| PUT | `/api/student/mark-assignment` | Mark assignment done → recalculate predictions |
| PUT | `/api/student/study-hours` | Update study hours goal |
| POST | `/api/student/study-plan` | Generate AI study plan via Groq |
| POST | `/api/student/whatif` | What-If calculator (40 parallel ML calls) |

### Chat
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chat/conversations` | List all chat sessions |
| POST | `/api/chat/conversations` | Create new session |
| GET | `/api/chat/conversations/:id` | Load session with messages |
| POST | `/api/chat/conversations/:id/message` | Send message + get AI reply |
| DELETE | `/api/chat/conversations/:id` | Delete session |
| POST | `/api/chat/upload` | Upload file + extract text |

### Faculty
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/faculty/dashboard` | All students + risk distribution |
| POST | `/api/faculty/analyst` | Natural language query over student data |
| POST | `/api/faculty/generate-assessment` | Generate exam questions via Groq |
| POST | `/api/faculty/course` | Add new course |
| POST | `/api/faculty/announcement` | Post announcement to course |
| PUT | `/api/faculty/grade` | Update student grade |

---

## ML API Endpoints

All served by Flask on `:5001`. Called exclusively by the Node.js backend.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| POST | `/predict` | Risk prediction with reasons + suggestions |
| POST | `/predict-grade` | Grade prediction |
| POST | `/predict-studytime` | Study time recommendation |
| POST | `/predict-cluster` | K-Means cluster + learning style |
| POST | `/predict-dynamic` | All-in-one: grade + risk + stress (used by Study Planner) |
| POST | `/explain` | SHAP explainability for risk prediction |
