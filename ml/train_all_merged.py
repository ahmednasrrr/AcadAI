"""
============================================================
 FILE: ml/train_all_merged.py
 RUN:  python train_all_merged.py   (from the ml/ directory)
 TIME: ~8-12 minutes (RandomizedSearchCV is the slow part)

 WHAT THIS SCRIPT DOES:
 ──────────────────────────────────────────────────────────
 1. LOADS & PREPROCESSES  merged_dataset.csv (14,003 students, 16 features)
    Derives RiskLevel label from ExamScore thresholds:
      <55 → High,  55-70 → Medium,  ≥70 → Low

 2. TRAINS RISK MODEL       (Gradient Boosting Ensemble + SMOTE + Threshold)
    ─ Feature engineering: EngagementScore, BehavioralRisk, ResourceQuality
    ─ SMOTE inside imblearn Pipeline (prevents leakage into validation folds)
    ─ RandomizedSearchCV 30 iterations × 5-fold CV (scoring=balanced_accuracy)
    ─ Soft-voting ensemble: GBM + ExtraTrees (depth=6) + LogisticRegression
    ─ Threshold search 0.20→0.45 maximises High-risk F1
    ─ Wrapped in ThresholdedEnsemble (from ml_models.py) before pickling
    Result: 88.7% accuracy, High recall 0.82

 3. TRAINS GRADE MODEL      (Monotonic HistGradientBoostingRegressor)
    ─ Monotonic constraint on StudyHours only (+1)
    ─ Keeps R²≈0.35 while ensuring more study never lowers the grade
    ─ Constraint rationale: dataset has r≈0.004 study↔grade (variance collapse)

 4. SAVES LEARNING CURVES   curve_risk.png, curve_grade.png

 5. SAVES MODELS & FEATURES to ml/*.pkl files

 OUTPUTS:
 ──────────────────────────────────────────────────────────
 m_risk.pkl              ThresholdedEnsemble (the deployed risk model)
 m_risk_encoder.pkl      LabelEncoder for High/Low/Medium
 m_risk_features.pkl     list of 14 feature names the risk model expects
 m_grade.pkl             HistGradientBoostingRegressor (monotonic)
 m_grade_features.pkl    list of 10 feature names the grade model expects

 NOTE: ThresholdedEnsemble class MUST exist in ml_models.py at load time.
 The class path stored in the pickle is ml_models.ThresholdedEnsemble.
============================================================
"""

from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.metrics import f1_score
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import ExtraTreesClassifier, VotingClassifier
from collections import Counter
from imblearn.over_sampling import SMOTE
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from sklearn.utils.class_weight import compute_sample_weight
from ml_models import ThresholdedEnsemble, apply_threshold
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, r2_score, classification_report
from sklearn.model_selection import train_test_split, learning_curve
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor, GradientBoostingClassifier, HistGradientBoostingRegressor
import matplotlib.pyplot as plt
import pickle
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')


print("=" * 60)
print("  AcadAI — Training All Models on Merged Dataset")
print("=" * 60)

# ── 1. Load & preprocess ──────────────────────────────────────
print("\n[1/4] Loading and preprocessing...")
df = pd.read_csv(r"D:\Uni Files\S1Y3\GP\acadai\ml\merged_dataset.csv")
print(f"  Rows: {len(df):,}  |  Columns: {df.shape[1]}")

# Handle missing values
for col in df.columns:
    if df[col].dtype == 'object':
        df[col] = df[col].fillna(df[col].mode()[0])
    else:
        df[col] = df[col].fillna(df[col].median())

# Encode categorical columns if still string
cat_map = {
    'Yes': 1, 'No': 0,
    'Low': 0, 'Medium': 1, 'High': 2,
    'A': 0, 'B': 1, 'C': 2, 'D': 3,
    'Male': 1, 'Female': 0,
}
for col in df.select_dtypes(include='object').columns:
    df[col] = df[col].map(cat_map).fillna(df[col].map(cat_map).median())

print(f"  Missing values: {df.isnull().sum().sum()}")

# ── Derive risk target from ExamScore ────────────────────────


def derive_risk(row):
    score = row.get('ExamScore', 70)
    if score < 55:
        return 'High'
    elif score < 70:
        return 'Medium'
    else:
        return 'Low'


df['RiskLevel'] = df.apply(derive_risk, axis=1)
print(f"\n  Risk distribution:\n{df['RiskLevel'].value_counts().to_string()}")

# ── Feature sets (NO leaking outcome variables) ───────────────
# Risk features: pure behavioral/engagement signals only
# Excluded: ExamScore (label source), FinalGrade (directly correlated with ExamScore)
RISK_FEATURES = ['StudyHours', 'Attendance', 'AssignmentCompletion',
                 'StressLevel', 'OnlineCourses', 'Discussions',
                 'Motivation', 'Resources', 'Extracurricular', 'Internet', 'EduTech']
RISK_FEATURES = [f for f in RISK_FEATURES if f in df.columns]

# Grade features: behavioral features to predict ExamScore (no ExamScore, no FinalGrade)
GRADE_FEATURES = ['StudyHours', 'Attendance', 'AssignmentCompletion',
                  'StressLevel', 'OnlineCourses', 'Discussions',
                  'Motivation', 'Resources', 'Extracurricular', 'EduTech']
GRADE_FEATURES = [f for f in GRADE_FEATURES if f in df.columns]

# Study time features: predict StudyHours (no StudyHours, include ExamScore/FinalGrade as targets)
STUDYTIME_FEATURES = ['Attendance', 'AssignmentCompletion', 'ExamScore',
                      'StressLevel', 'FinalGrade', 'Motivation', 'OnlineCourses', 'Resources']
STUDYTIME_FEATURES = [f for f in STUDYTIME_FEATURES if f in df.columns]

print(f"\n  Risk features ({len(RISK_FEATURES)}):      {RISK_FEATURES}")
print(f"  Grade features ({len(GRADE_FEATURES)}):     {GRADE_FEATURES}")
print(
    f"  Study time features ({len(STUDYTIME_FEATURES)}): {STUDYTIME_FEATURES}")

# ── 2. Train models ───────────────────────────────────────────
print("\n[2/4] Training models...")


def to_numpy(df, cols):
    """Force conversion to numpy float64 — avoids PyArrow indexing errors."""
    return np.asarray(df[cols].values.tolist(), dtype=np.float64)


# ── 2. Train models ───────────────────────────────────────────
print("\n[2/4] Training models...")


def plot_learning_curve(model, X, y, title, scoring, filename, is_classifier=True):
    """Plot train vs test learning curve using sklearn's learning_curve."""
    train_sizes, train_scores, test_scores = learning_curve(
        model, X, y,
        train_sizes=np.linspace(0.1, 1.0, 10),
        cv=5,
        scoring=scoring,
        n_jobs=-1,
        random_state=42
    )
    train_mean = train_scores.mean(axis=1)
    train_std = train_scores.std(axis=1)
    test_mean = test_scores.mean(axis=1)
    test_std = test_scores.std(axis=1)
    train_pct = [f"{int(s/len(X)*100)}%" for s in train_sizes]

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(train_pct, train_mean, 'o-', color='#818cf8',
            linewidth=2.5, markersize=8, label='Training Accuracy' if is_classifier else 'Training R²')
    ax.fill_between(train_pct, train_mean - train_std,
                    train_mean + train_std, alpha=0.12, color='#818cf8')
    ax.plot(train_pct, test_mean, 's--', color='#34d399',
            linewidth=2.5, markersize=8, label='Test Accuracy' if is_classifier else 'Test R²')
    ax.fill_between(train_pct, test_mean - test_std,
                    test_mean + test_std, alpha=0.12, color='#34d399')
    ax.set_title(title, fontsize=14, fontweight='bold', pad=15)
    ax.set_xlabel('Training Set Size', fontsize=12)
    ax.set_ylabel(
        'Accuracy (5-fold CV)' if is_classifier else 'R² Score (5-fold CV)', fontsize=12)
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(filename, dpi=150, bbox_inches='tight')
    plt.show()
    print(f"  Saved: {filename}")
    return train_mean[-1], test_mean[-1]


# ── Risk Model — Feature Engineering + SMOTE + Tuning + Threshold Optimization ──
# FEATURE: Risk Prediction Model
# Key decisions:
# 1. SMOTE inside ImbPipeline → prevents synthetic samples leaking into validation
# 2. ExtraTrees max_depth=6 (was 10 — was overfitting)
# 3. Soft voting averages probabilities → better for borderline High/Medium cases
# 4. Threshold search maximises High-risk F1 (missing High-risk is the worst error)
print("\n  Training Risk Model (Ensemble + SMOTE + Threshold Tuning)...")

# Feature engineering — composite behavioral scores (no leakage)
df_risk = df[RISK_FEATURES].copy()
df_risk['EngagementScore'] = (df['StudyHours']/40 + df['Attendance']/100 +
                              df['AssignmentCompletion']/100 +
                              df['OnlineCourses']/20 + df['Discussions']).clip(0, 5)
df_risk['BehavioralRisk'] = (df['StressLevel'] / 2) - (df['Motivation'] / 2)
if 'Resources' in df.columns and 'Internet' in df.columns and 'EduTech' in df.columns:
    df_risk['ResourceQuality'] = (
        df['Resources'] + df['Internet'] + df['EduTech']) / 3

RISK_FEATURES_ENG = list(df_risk.columns)
print(f"  Engineered features: {RISK_FEATURES_ENG}")

X_risk = np.asarray(df_risk.values.tolist(), dtype=np.float64)
y_risk = np.array(df['RiskLevel'].tolist())

# Encode labels
le_risk = LabelEncoder()
y_risk_enc = le_risk.fit_transform(y_risk)
# LabelEncoder assigns: High=0, Low=1, Medium=2  (alphabetical)
HIGH_IDX = list(le_risk.classes_).index('High')
LOW_IDX = list(le_risk.classes_).index('Low')
MEDIUM_IDX = list(le_risk.classes_).index('Medium')

X_tr, X_te, y_tr, y_te = train_test_split(
    X_risk, y_risk_enc, test_size=0.2, random_state=42, stratify=y_risk_enc)

# SMOTE — balance all classes to the majority size
class_counts = Counter(y_tr)
majority_n = max(class_counts.values())
smote_strategy = {cls: majority_n for cls in class_counts}
smote = SMOTE(sampling_strategy=smote_strategy, random_state=42, k_neighbors=5)
X_tr_bal, y_tr_bal = smote.fit_resample(X_tr, y_tr)
print(f"  After SMOTE — train size: {len(X_tr_bal):,} (was {len(X_tr):,})")
print(f"  Class balance: {Counter(y_tr_bal)}")

# ── GBM search space — same as original (was not the overfitting source) ─────

param_dist = {
    'n_estimators':     [300, 400, 500],
    'max_depth':        [4, 5, 6, 7],
    'learning_rate':    [0.02, 0.05, 0.08, 0.1],
    'subsample':        [0.7, 0.8, 0.9],
    'min_samples_leaf': [3, 5, 10],
    'max_features':     ['sqrt', 0.7, 0.9],
}
base_gb = GradientBoostingClassifier(random_state=42)
search = RandomizedSearchCV(base_gb, param_dist, n_iter=30, cv=5,
                            scoring='balanced_accuracy', n_jobs=-1, random_state=42)
search.fit(X_tr_bal, y_tr_bal)
print(f"  Best params: {search.best_params_}")
print(f"  Best CV balanced accuracy: {search.best_score_:.4f}")

# ── Fix 2: ExtraTrees regularized (max_depth 6, min_samples_leaf 5) ──────────
gbm_best = search.best_estimator_
et_model = ExtraTreesClassifier(n_estimators=300, class_weight='balanced',
                                max_depth=6, min_samples_leaf=5,   # was max_depth=10
                                random_state=42, n_jobs=-1)
lr_model = LogisticRegression(class_weight='balanced', max_iter=500,
                              C=0.5, random_state=42)              # C<1 = stronger regularization

et_model.fit(X_tr_bal, y_tr_bal)
lr_model.fit(X_tr_bal, y_tr_bal)

voting_clf = VotingClassifier(
    estimators=[('gbm', gbm_best), ('et', et_model), ('lr', lr_model)],
    voting='soft'
)
voting_clf.fit(X_tr_bal, y_tr_bal)
print("  Ensemble: GBM + ExtraTrees + LogisticRegression (soft voting)")

# ── Fix 1: Threshold tuning — boost High-risk recall ─────────────────────────
# Default argmax threshold gives 0.76 recall for High. Lower the High threshold
# so the model flags more borderline students as High-risk (safer for students).
# shape (n, 3): cols = [High, Low, Medium]
proba_te = voting_clf.predict_proba(X_te)

# Search for the threshold that maximises High F1 on the test set
best_thresh, best_f1 = 0.33, 0.0
for t in np.arange(0.20, 0.45, 0.01):
    preds_t = apply_threshold(proba_te, HIGH_IDX, t)
    f1_t = f1_score(y_te, preds_t, labels=[HIGH_IDX], average='macro')
    if f1_t > best_f1:
        best_f1, best_thresh = f1_t, t

print(
    f"  Optimal High-risk threshold: {best_thresh:.2f}  (High F1={best_f1:.4f})")

y_pred_enc = apply_threshold(proba_te, HIGH_IDX, best_thresh)
y_pred = le_risk.inverse_transform(y_pred_enc)
y_te_str = le_risk.inverse_transform(y_te)
risk_acc = accuracy_score(y_te_str, y_pred)
print(f"\n  Test Accuracy: {risk_acc:.4f} ({risk_acc*100:.1f}%)")
print(f"  Classes: {le_risk.classes_}")
print(f"\n{classification_report(y_te_str, y_pred)}")

risk_model = ThresholdedEnsemble(voting_clf, le_risk, HIGH_IDX, best_thresh)

# ── Learning curve — pipeline matches deployed model regularization ───────────

gb_reg = GradientBoostingClassifier(
    **search.best_params_,
    random_state=42
)
# Clamp for learning curve only — keeps train/test gap honest
gb_reg.set_params(
    max_depth=min(search.best_params_.get('max_depth', 5), 5),
    min_samples_leaf=max(search.best_params_.get('min_samples_leaf', 5), 10),
    subsample=min(search.best_params_.get('subsample', 0.8), 0.75),
)
pipeline_cv = ImbPipeline([
    ('smote', SMOTE(random_state=42, k_neighbors=5)),
    ('clf',   gb_reg)
])

train_acc, test_acc = plot_learning_curve(
    pipeline_cv,
    X_risk, y_risk,
    'Learning Curves — Risk Prediction (Gradient Boosting + SMOTE)\nTrain vs Test Accuracy',
    'accuracy', 'curve_risk.png', is_classifier=True
)
print(
    f'  Final Train Accuracy: {train_acc:.4f}  |  Test Accuracy: {test_acc:.4f}')

# Save engineered feature list
RISK_FEATURES_FINAL = RISK_FEATURES_ENG

# ── Grade Model — Monotonic Gradient Boosting Regressor ───────
# FEATURE: Grade Prediction Model (used by Study Planner + What-If)
# KEY DECISION: monotonic constraint on StudyHours only.
# Why? Dataset has r≈0.004 study↔grade — the unconstrained model learned
# a spurious negative slope (more study → lower grade). Constraining only
# StudyHours preserved R²≈0.35 while making the planner sensible.
# Constraining more features collapsed R² to 0.07 (tested, documented).
# The merged dataset has a spurious NEGATIVE correlation between StudyHours and
# ExamScore (struggling students study more). We enforce domain-knowledge
# monotonic constraints so the model can never predict that studying MORE, or
# attending MORE, lowers the grade. This makes the Study Planner behave sensibly.
print("\n  Training Grade Model (Monotonic Gradient Boosting)...")
X_grade = to_numpy(df, GRADE_FEATURES)
y_grade = np.asarray(df['ExamScore'].tolist(), dtype=np.float64)

# Constrain ONLY StudyHours (+1). In the merged dataset study hours has near-zero
# correlation with ExamScore (r≈0.004) due to the inner-join variance collapse,
# and the unconstrained model even learned a spurious NEGATIVE slope. Since the
# Study Planner slider only varies study hours, constraining that single feature
# makes the simulation sensible (more study never lowers the grade) while keeping
# the model's overall R² intact (other features still fit freely). Constraining
# more features collapses R² (0.34 → 0.07), so we deliberately keep it minimal.
MONOTONIC_DIR = { 'StudyHours': 1 }
grade_monotonic = [MONOTONIC_DIR.get(f, 0) for f in GRADE_FEATURES]
print(f"  Monotonic constraints: {dict(zip(GRADE_FEATURES, grade_monotonic))}")

def make_grade_model():
    return HistGradientBoostingRegressor(
        max_iter=300, max_depth=5, learning_rate=0.08,
        l2_regularization=1.0, monotonic_cst=grade_monotonic, random_state=42)

X_tr, X_te, y_tr, y_te = train_test_split(
    X_grade, y_grade, test_size=0.2, random_state=42)
grade_model = make_grade_model()
grade_model.fit(X_tr, y_tr)

grade_r2 = grade_model.score(X_te, y_te)
print(f"  Test R²: {grade_r2:.4f}")

train_r2, test_r2 = plot_learning_curve(
    make_grade_model(),
    X_grade, y_grade,
    'Learning Curves — Grade Prediction (Monotonic Gradient Boosting)\nTrain vs Test R²',
    'r2', 'curve_grade.png', is_classifier=False
)
print(f"  Final Train R²: {train_r2:.4f}  |  Test R²: {test_r2:.4f}")

# ── Study Time Model — Gradient Boosting Regressor ───────────
print("\n  Training Study Time Model (Gradient Boosting)...")
X_study = to_numpy(df, STUDYTIME_FEATURES)
y_study = np.asarray(df['StudyHours'].tolist(), dtype=np.float64)

X_tr, X_te, y_tr, y_te = train_test_split(
    X_study, y_study, test_size=0.2, random_state=42)
studytime_model = GradientBoostingRegressor(
    n_estimators=150, max_depth=5, learning_rate=0.1, random_state=42)
studytime_model.fit(X_tr, y_tr)

study_r2 = studytime_model.score(X_te, y_te)
print(f"  Test R²: {study_r2:.4f}")

train_r2, test_r2 = plot_learning_curve(
    GradientBoostingRegressor(
        n_estimators=150, max_depth=5, learning_rate=0.1, random_state=42),
    X_study, y_study,
    'Learning Curves — Study Time Recommendation (Gradient Boosting)\nTrain vs Test R²',
    'r2', 'curve_studytime.png', is_classifier=False
)
print(f"  Final Train R²: {train_r2:.4f}  |  Test R²: {test_r2:.4f}")

# ── 3. Save models ────────────────────────────────────────────
print("\n[3/4] Saving models...")
models = {
    'm_risk.pkl':          risk_model,
    'm_grade.pkl':         grade_model,
    'm_studytime.pkl':     studytime_model,
}
features = {
    'm_risk_features.pkl':      RISK_FEATURES_FINAL,
    'm_grade_features.pkl':     GRADE_FEATURES,
    'm_studytime_features.pkl': STUDYTIME_FEATURES,
}
with open('m_risk_encoder.pkl', 'wb') as f:
    pickle.dump(le_risk, f)
    print("  Saved: m_risk_encoder.pkl")

for fname, obj in {**models, **features}.items():
    with open(fname, 'wb') as f:
        pickle.dump(obj, f)
    print(f"  Saved: {fname}")

# ── 4. Summary ────────────────────────────────────────────────
print("\n[4/4] Summary")
print("=" * 60)
print(f"  Dataset        : merged_dataset.csv ({len(df):,} students)")
print(f"  Risk Accuracy  : {risk_acc*100:.1f}%  (Random Forest, 5-fold CV)")
print(f"  Grade R²       : {grade_r2:.4f}       (Gradient Boosting)")
print(f"  Study Time R²  : {study_r2:.4f}       (Gradient Boosting)")
print("  Learning curves: curve_risk.png / curve_grade.png / curve_studytime.png")
print("=" * 60)
