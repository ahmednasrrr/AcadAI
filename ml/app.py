"""
============================================================
 FILE: ml/app.py
 SERVER: Flask ML API  →  http://127.0.0.1:5001
 Called exclusively by: backend/routes/student.js & faculty.js
 (React never calls Flask directly — all requests go through Node.js)

 ENDPOINTS & FEATURES:
 ──────────────────────────────────────────────────────────
 GET  /                   line ~165  health check
 POST /predict            line ~172  RISK PREDICTION (full response with reasons)
 POST /predict-grade      line ~212  GRADE PREDICTION (calls planner_grade)
 POST /predict-studytime  line ~225  [legacy endpoint, kept for compatibility]
 POST /predict-cluster    line ~238  K-MEANS CLUSTER → learning style
 POST /predict-dynamic    line ~270  ALL-IN-ONE: grade + risk + stress + SHAP
                                     Called by mark-assignment & study-hours slider.
                                     include_shap=true adds SHAP (skipped otherwise
                                     so bulk what-if calls stay fast).
 POST /explain            line ~320  SHAP EXPLAINABILITY (standalone)

 KEY FUNCTIONS (non-endpoint):
 ──────────────────────────────────────────────────────────
 map_student_data()       line ~75   converts AcadAI engagement → 16 ML features
                                     This is the feature-engineering bridge between
                                     what AcadAI tracks and what the models expect.
 planner_grade()          line ~145  grade prediction with study-effort overlay
                                     Anchors on real average grade (70%) + ML (30%)
                                     + diminishing-returns effort curve.
                                     Monotonic: more study NEVER lowers the grade.
 stress_display()         line ~162  dynamic stress from study hours + missed work
 compute_shap()           line ~128  SHAP TreeExplainer on ExtraTrees component
                                     Returns contributions[] sorted by |value|.

 MODELS LOADED ON STARTUP (never per-request — too slow):
 ──────────────────────────────────────────────────────────
 m_risk.pkl              → ThresholdedEnsemble (GBM + ExtraTrees + LR, threshold=0.35)
 m_grade.pkl             → HistGradientBoostingRegressor (monotonic on StudyHours)
 merged_kmeans.pkl       → KMeans k=6
 merged_scaler.pkl       → StandardScaler for K-Means features
 m_risk_encoder.pkl      → LabelEncoder (High/Low/Medium ↔ int)
 ThresholdedEnsemble class defined in: ml/ml_models.py
============================================================
"""
import warnings; warnings.filterwarnings('ignore')

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle, os, math, numpy as np, pandas as pd

try:
    import shap; SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False; print("⚠ SHAP not installed — run: pip install shap")

app = Flask(__name__)
CORS(app)

from ml_models import ThresholdedEnsemble, apply_threshold  # noqa: F401 — needed for pickle

# ── Load models ───────────────────────────────────────────────
def load(path):
    with open(path, 'rb') as f: return pickle.load(f)

risk_model      = load('m_risk.pkl')
grade_model     = load('m_grade.pkl')
studytime_model = load('m_studytime.pkl')
RISK_FEATURES      = load('m_risk_features.pkl')
GRADE_FEATURES     = load('m_grade_features.pkl')
STUDYTIME_FEATURES = load('m_studytime_features.pkl')

# Risk label encoder (Gradient Boosting predicts integers → decode to Low/Medium/High)
risk_encoder = None
if os.path.exists('m_risk_encoder.pkl'):
    risk_encoder = load('m_risk_encoder.pkl')
    print("✅ Risk label encoder loaded")
print("✅ Supervised models loaded (merged dataset)")

# K-Means clustering (learning style)
merged_kmeans = merged_scaler = merged_labels = merged_features = None
if os.path.exists('merged_kmeans.pkl'):
    merged_kmeans   = load('merged_kmeans.pkl')
    merged_scaler   = load('merged_scaler.pkl')
    merged_labels   = load('merged_labels.pkl')
    merged_features = load('merged_features.pkl')
    print("✅ K-Means clustering model loaded")

# SHAP on the ExtraTrees component — supports multi-class, faster than GBM
risk_explainer = None
if SHAP_AVAILABLE:
    try:
        et_component   = risk_model.clf.named_estimators_['et']
        risk_explainer = shap.TreeExplainer(et_component)
        print("✅ SHAP explainer ready (ExtraTrees component)")
    except Exception as e:
        print(f"⚠ SHAP failed: {e}")

print("✅ All models ready")

# ── SHAP feature labels ───────────────────────────────────────
SHAP_LABELS = {
    'StudyHours':           'Study Hours',
    'Attendance':           'Class Attendance',
    'AssignmentCompletion': 'Assignment Completion',
    'ExamScore':            'Exam Score',
    'StressLevel':          'Stress Level',
    'OnlineCourses':        'Online Engagement',
    'Discussions':          'Discussions',
    'Motivation':           'Motivation',
    'FinalGrade':           'Final Grade',
}

# ── Feature mapping: AcadAI engagement → merged dataset ──────
# FEATURE: Feature Engineering Bridge
# Converts the raw AcadAI engagement fields (quizzes_missed, login_frequency,
# etc.) into the 16 numerical features the ML models were trained on.
# This is called by EVERY endpoint before any model runs.
# stress_pct here is for DISPLAY only — model stress is workload-based (stable)
# so the grade prediction stays monotonic when study hours change.
def map_student_data(data):
    """Converts AcadAI student engagement data to merged dataset features."""
    study_hours = data.get('study_hours')
    if study_hours is None:
        lf = data.get('login_frequency', 5)
        study_hours = max(1.0, min(40.0, float(lf) * 1.5))

    quizzes_missed        = data.get('quizzes_missed', 0)
    attendance            = max(0.0, min(100.0, 100.0 - float(quizzes_missed) * 10.0))
    assignments_missed    = data.get('assignments_missed', 0)
    assignments_submitted = data.get('assignments_submitted', 6)
    total                 = assignments_missed + assignments_submitted
    assignment_completion = (assignments_submitted / total * 100.0) if total > 0 else max(0.0, 100.0 - float(assignments_missed) * 15.0)
    exam_score            = float(data.get('average_grade', 70))
    # Model stress: workload-only, kept independent of study hours so the grade
    # model stays cleanly monotonic in study time.
    workload              = float(quizzes_missed) + float(assignments_missed)
    stress                = 0 if workload == 0 else (1 if workload <= 2 else 2)
    # Display stress: dynamic with study hours (more study → calmer, better prepared)
    stress_pct            = max(5.0, min(95.0, 50.0 - (float(study_hours) - 10.0) * 2.2 + workload * 12.0))
    online_courses        = min(20.0, float(data.get('login_frequency', 5)))
    discussions           = 1.0 if assignments_submitted > 3 else 0.0
    lf                    = data.get('login_frequency', 5)
    motivation            = 2 if lf >= 15 else (1 if lf >= 7 else 0)
    gpa                   = data.get('gpa', 2.5)
    final_grade           = 0 if gpa >= 3.5 else (1 if gpa >= 2.5 else (2 if gpa >= 1.5 else 3))

    # Composite engineered features (same as training)
    engagement_score  = (float(study_hours)/40 + attendance/100 +
                         assignment_completion/100 + online_courses/20 + discussions)
    behavioral_risk   = (stress / 2) - (motivation / 2)
    resource_quality  = 1.0  # default — no resource data from AcadAI

    return {
        'StudyHours':           float(study_hours),
        'Attendance':           float(attendance),
        'AssignmentCompletion': float(assignment_completion),
        'ExamScore':            float(exam_score),
        'StressLevel':          float(stress),
        'OnlineCourses':        float(online_courses),
        'Discussions':          float(discussions),
        'Motivation':           float(motivation),
        'FinalGrade':           float(final_grade),
        'Resources':            1.0,
        'Extracurricular':      1.0 if lf >= 10 else 0.0,
        'Internet':             1.0,
        'EduTech':              1.0,
        'EngagementScore':      float(engagement_score),
        'BehavioralRisk':       float(behavioral_risk),
        'ResourceQuality':      float(resource_quality),
        # display-only fields (ignored by make_X)
        '_stress_pct':          float(stress_pct),
        '_study_hours':         float(study_hours),
    }


def make_X(mapped, features):
    return np.array([[mapped[f] for f in features]], dtype=np.float64)


# ── Study-effort model ────────────────────────────────────────
# The merged dataset's study-hours signal is near-zero (r≈0.004) due to its
# variance collapse, so the ML grade model alone barely responds to study time.
# For the Study Planner we overlay a transparent diminishing-returns effort
# curve on the ML baseline: each extra hour helps, but with shrinking returns.
STUDY_TAU  = 12.0   # how fast returns diminish (higher = useful at more hours)
STUDY_GAIN = 26.0   # total points the effort curve can move the grade
STUDY_REF  = 6.0    # baseline effort: grade ≈ anchor at this many hours

def _study_unit(h):
    return 1.0 - math.exp(-float(h) / STUDY_TAU)

# FEATURE: Study Planner grade engine
# Why not just use grade_model.predict() directly?
# The dataset has r≈0.004 study↔grade (variance collapse from inner-join).
# Unconstrained model produced a NEGATIVE slope: more study → lower grade.
# Fix: anchor on real student average (70%) + ML behavioural estimate (30%),
# then add a transparent diminishing-returns effort curve.
# Monotonic constraint on StudyHours in the HistGBR means the baseline never
# decreases, and the overlay adds on top → grade always rises with hours.
def planner_grade(mapped):
    """
    Anchor on the student's real average grade (believable, grounded in their
    actual performance), nudged by the ML behavioural model, then projected with
    a transparent diminishing-returns study-effort curve. Studying more always
    helps (monotonic); ambitious goals stay reachable for strong students.
    """
    ml     = float(grade_model.predict(make_X(mapped, GRADE_FEATURES))[0])
    actual = float(mapped.get('ExamScore', ml))
    anchor = 0.70 * actual + 0.30 * ml
    h      = float(mapped.get('_study_hours', STUDY_REF))
    adj    = STUDY_GAIN * (_study_unit(h) - _study_unit(STUDY_REF))
    g      = round(max(0.0, min(100.0, anchor + adj)), 1)
    lt = ('A' if g>=90 else 'A-' if g>=85 else 'B+' if g>=80 else 'B' if g>=75
          else 'B-' if g>=70 else 'C+' if g>=65 else 'C' if g>=60 else 'C-' if g>=55
          else 'D' if g>=50 else 'F')
    return g, lt

def stress_display(mapped):
    p = float(mapped.get('_stress_pct', 50.0))
    if   p < 35: lvl, color = 'Low',      '#34d399'
    elif p < 65: lvl, color = 'Moderate', '#fbbf24'
    else:        lvl, color = 'High',     '#f87171'
    return {'stress_pct': round(p), 'level': lvl, 'color': color}


# FEATURE: SHAP Explainability
# Uses ExtraTrees component (not GBM) because sklearn's TreeExplainer
# does NOT support multiclass GradientBoostingClassifier — only ExtraTrees.
# Returns contributions[] sorted by |value|, each with direction + share %.
# The frontend filters to SHAP_VISIBLE factors only (honest, tracked data).
def compute_shap(mapped):
    """Compute SHAP contributions for the risk prediction of one student."""
    if risk_explainer is None:
        return None
    X = make_X(mapped, RISK_FEATURES)
    prediction = str(risk_model.predict(X)[0])
    classes    = list(risk_model.classes_)
    target     = 'High' if 'High' in classes else classes[-1]
    t_idx      = classes.index(target)

    shap_vals = risk_explainer.shap_values(X)
    if isinstance(shap_vals, list):
        arr = np.array(shap_vals[t_idx][0])
    elif len(np.array(shap_vals).shape) == 3:
        arr = np.array(shap_vals)[0, :, t_idx]
    else:
        arr = np.array(shap_vals[0])

    contribs = []
    for i, feat in enumerate(RISK_FEATURES):
        val = float(arr[i])
        contribs.append({'feature': SHAP_LABELS.get(feat, feat),
                         'value': round(val, 4),
                         'direction': 'increases' if val > 0 else 'decreases'})

    max_abs   = max((abs(c['value']) for c in contribs), default=1) or 1
    total_abs = sum(abs(c['value']) for c in contribs) or 1
    for c in contribs:
        c['pct']   = round(c['value'] / max_abs * 100, 1)
        c['width'] = round(abs(c['pct']), 1)
        c['share'] = round(abs(c['value']) / total_abs * 100, 0)
    contribs.sort(key=lambda x: abs(x['value']), reverse=True)

    return {'prediction': prediction, 'target_class': target, 'contributions': contribs}


# ── Health check ──────────────────────────────────────────────
@app.route('/', methods=['GET'])
def home():
    return jsonify({'message': 'AcadAI ML API', 'dataset': 'merged (14,003 students)',
                    'models': ['risk','grade','studytime','clustering','shap']})


# ── Risk prediction ───────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data   = request.get_json() or {}
        mapped = map_student_data(data)
        X = make_X(mapped, RISK_FEATURES)
        raw_pred     = risk_model.predict(X)[0]
        # Decode if GradientBoosting returns integer labels
        if risk_encoder is not None and isinstance(raw_pred, (int, np.integer)):
            prediction = risk_encoder.inverse_transform([int(raw_pred)])[0]
            classes    = risk_encoder.classes_
        else:
            prediction = str(raw_pred)
            classes    = risk_model.classes_
        probabilities = risk_model.predict_proba(X)[0]
        confidence    = {str(classes[i]): round(float(probabilities[i]) * 100, 2)
                         for i in range(len(classes))}

        reasons, suggestions = [], []
        gpa  = data.get('gpa', 0)
        am   = data.get('assignments_missed', 0)
        qm   = data.get('quizzes_missed', 0)
        ag   = data.get('average_grade', 0)
        lf   = data.get('login_frequency', 0)

        if gpa < 2.0:   reasons.append(f"Your GPA is critically low at {gpa}"); suggestions.append("Seek academic counseling immediately")
        elif gpa < 2.5: reasons.append(f"Your GPA of {gpa} is below the safe threshold"); suggestions.append("Focus on improving your grades in all courses")
        if am >= 3:  reasons.append(f"You have missed {am} assignment(s)"); suggestions.append("Submit all pending assignments as soon as possible")
        if qm >= 2:  reasons.append(f"You have missed {qm} quizzes"); suggestions.append("Attend all upcoming quizzes without exception")
        if ag < 55:  reasons.append(f"Your average grade of {ag}% is critically low"); suggestions.append("Seek help from your instructors immediately")
        elif ag < 70: reasons.append(f"Your average grade of {ag}% needs improvement"); suggestions.append("Study harder and attend office hours")
        if lf < 5:   reasons.append(f"Very low engagement with only {lf} logins"); suggestions.append("Log in regularly to stay up to date")
        if not reasons:
            reasons.append("You are performing well across all metrics"); suggestions.append("Keep up the great work!")

        return jsonify({'risk_level': prediction, 'confidence': confidence,
                        'reasons': reasons, 'suggestions': suggestions,
                        'message': f'Student is at {prediction} risk'})
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ── Grade prediction ──────────────────────────────────────────
@app.route('/predict-grade', methods=['POST'])
def predict_grade():
    try:
        data   = request.get_json() or {}
        mapped = map_student_data(data)
        grade, letter = planner_grade(mapped)

        return jsonify({'predicted_grade': grade, 'predicted_letter': letter,
                        'message': f'Predicted final grade: {grade}% ({letter})'})
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ── Study time recommendation ─────────────────────────────────
@app.route('/predict-studytime', methods=['POST'])
def predict_studytime():
    try:
        data   = request.get_json() or {}
        mapped = map_student_data(data)
        X = make_X(mapped, STUDYTIME_FEATURES)

        hours = round(max(1.0, min(40.0, float(studytime_model.predict(X)[0]))), 1)
        if   hours <= 5:  label, color = 'Minimal',   '#f87171'
        elif hours <= 10: label, color = 'Moderate',  '#fbbf24'
        elif hours <= 20: label, color = 'High',      '#818cf8'
        else:             label, color = 'Intensive', '#34d399'

        return jsonify({'recommended_studytime': hours, 'hours_per_week': f'{hours} hrs/week',
                        'label': label, 'color': color,
                        'message': f'Recommended: {hours} hrs/week ({label})'})
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ── Learning style clustering (merged K-Means) ────────────────
@app.route('/predict-cluster', methods=['POST'])
def predict_cluster():
    try:
        if merged_kmeans is None:
            return jsonify({'error': 'Clustering model not loaded. Run train_merged_model.py first.'}), 503

        data   = request.get_json() or {}
        mapped = map_student_data(data)
        X = np.array([[mapped.get(f, 0.0) for f in merged_features]], dtype=np.float64)
        X_scaled   = merged_scaler.transform(X)
        cluster_id = int(merged_kmeans.predict(X_scaled)[0])
        meta = merged_labels.get(cluster_id, {
            'name': 'Balanced Performer', 'description': 'Solid performance.',
            'advice': 'Keep going!', 'color': '#60a5fa', 'bg': 'rgba(96,165,250,0.1)',
            'learning_style': 'Blended Learning', 'percentage': 20,
        })
        all_clusters = [{'name': v['name'], 'percentage': v['percentage'], 'color': v['color']}
                        for k, v in sorted(merged_labels.items())]
        return jsonify({
            'cluster_id':     cluster_id,
            'cluster_name':   meta['name'],
            'description':    meta['description'],
            'color':          meta['color'],
            'bg':             meta.get('bg','rgba(96,165,250,0.1)'),
            'advice':         meta['advice'],
            'learning_style': meta.get('learning_style','Blended Learning'),
            'percentage':     meta.get('percentage', 20),
            'all_clusters':   all_clusters,
        })
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ── Dynamic prediction (all models in one call) ───────────────
# FEATURE: Live Dashboard Recalculation
# This is the most-called endpoint. Runs grade + risk + stress in one call.
# Called by: mark-assignment, study-hours slider, and what-if (40 parallel calls).
# include_shap=true adds SHAP — omitted for bulk what-if calls for speed.
# Risk is derived from grade (not the classifier) so the planner is consistent:
#   grade >= 70 → Low,  55-70 → Medium,  < 55 → High
@app.route('/predict-dynamic', methods=['POST'])
def predict_dynamic():
    try:
        data   = request.get_json() or {}
        mapped = map_student_data(data)
        result = {}

        # Grade — monotonic ML baseline + study-effort overlay
        g = None
        try:
            g, lt = planner_grade(mapped)
            result['grade'] = {'predicted_grade': g, 'predicted_letter': lt}
        except Exception: result['grade'] = {}

        # Stress — dynamic with study hours (more study → lower stress)
        try:    result['stress'] = stress_display(mapped)
        except Exception: result['stress'] = {}

        # Risk — derived from the predicted grade using the SAME thresholds the
        # risk labels were built on (ExamScore <55 High, <70 Medium, else Low).
        # This keeps the Study Planner consistent & monotonic: more study →
        # higher grade → lower risk. (The standalone /predict classifier is
        # still used for the initial assessment, SHAP, and the faculty portal.)
        try:
            if g is not None:
                if   g >= 70: lvl = 'Low'
                elif g >= 55: lvl = 'Medium'
                else:         lvl = 'High'
                boundary = 70 if g >= 70 else (55 if g >= 55 else 55)
                conf = round(min(95.0, 65.0 + abs(g - boundary) * 1.5), 1)
                result['risk'] = {'risk_level': lvl, 'confidence': {lvl: conf}}
            else:
                result['risk'] = {'risk_level': 'Medium', 'confidence': {}}
        except Exception: result['risk'] = {'risk_level': 'Medium', 'confidence': {}}

        # SHAP only when explicitly requested (keeps bulk what-if calls fast)
        if data.get('include_shap'):
            try:    result['shap'] = compute_shap(mapped)
            except: result['shap'] = None
        else:
            result['shap'] = None

        return jsonify(result)

    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


# ── SHAP explainability ───────────────────────────────────────
@app.route('/explain', methods=['POST'])
def explain():
    try:
        data   = request.get_json() or {}
        mapped = map_student_data(data)
        result = compute_shap(mapped)
        if result is None:
            return jsonify({'contributions': []}), 200
        return jsonify(result)
    except Exception as e:
        import traceback; print(traceback.format_exc())
        return jsonify({'contributions': [], 'error': str(e)}), 200


if __name__ == '__main__':
    app.run(port=5001, debug=True)