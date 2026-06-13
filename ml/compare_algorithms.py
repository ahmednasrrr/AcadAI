"""
AcadAI — Algorithm Comparison Report
Runs 5-fold cross-validation for 5 algorithms across 5 tasks.
Saves model_comparison_results.json for the project report.
"""
import pandas as pd
import numpy as np
from sklearn.ensemble import (RandomForestClassifier, RandomForestRegressor,
                              GradientBoostingClassifier, GradientBoostingRegressor)
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
import json
import warnings
warnings.filterwarnings('ignore')

print("=" * 65)
print("  AcadAI — Algorithm Comparison Report")
print("  Dataset: UCI Student Performance (1,044 students)")
print("  Method:  5-fold cross-validation")
print("=" * 65)

# ── Load data — force numpy-backed dtypes to avoid PyArrow issues ─
mat = pd.read_csv('student-mat.csv', sep=';').infer_objects()
por = pd.read_csv('student-por.csv', sep=';').infer_objects()
df = pd.concat([mat, por], ignore_index=True)
# Convert all numeric columns to plain numpy float to avoid PyArrow backend
for col in df.select_dtypes(include='number').columns:
    df[col] = df[col].astype(float)

# ── Label factories ───────────────────────────────────────────────


def risk_label(row):
    if row['G3'] < 10:
        return 'High'
    elif row['G3'] < 14:
        return 'Medium'
    else:
        return 'Low'


def trend_label(row):
    d = row['G2'] - row['G1']
    if d > 1:
        return 'Improving'
    elif d < -1:
        return 'Declining'
    else:
        return 'Stable'


def dropout_label(row):
    return 1 if (row['G3'] == 0 or row['failures'] >= 3) else 0


def studytime_rec(row):
    avg = (row['G1'] + row['G2']) / 2
    gf = (20 - avg) / 20
    ff = min(row['failures'] / 3, 1.0)
    af = min(row['absences'] / 25, 1.0)
    need = 0.55 * gf + 0.30 * ff + 0.15 * af
    return 2.0 + need * 16.0


# ── Task definitions ──────────────────────────────────────────────
TASKS = [
    {
        'name':     'Academic Risk',
        'type':     'classification',
        'features': ['failures', 'absences', 'G1', 'G2', 'studytime'],
        'label_fn': risk_label,
        'selected': 'Random Forest',
        'score':    0.9569,
    },
    {
        'name':     'Grade Prediction',
        'type':     'regression',
        'features': ['failures', 'absences', 'G1', 'G2', 'studytime'],
        'target':   'G3',
        'selected': 'Linear Regression',
        'score':    0.80,
    },
    {
        'name':     'Performance Trend',
        'type':     'classification',
        'features': ['failures', 'absences', 'G1', 'G2', 'studytime'],
        'label_fn': trend_label,
        'selected': 'Random Forest',
        'score':    0.9169,
    },
    {
        'name':     'Dropout Risk',
        'type':     'classification',
        'features': ['failures', 'absences', 'G1', 'G2', 'studytime'],
        'label_fn': dropout_label,
        'selected': 'Random Forest',
        'score':    0.8660,
    },
    {
        'name':     'Study Time',
        'type':     'regression',
        'features': ['failures', 'absences', 'G1', 'G2'],
        'label_fn': studytime_rec,
        'selected': 'Gradient Boosting',
        'score':    0.9258,
    },
]

CLASSIFIERS = {
    'Random Forest':       RandomForestClassifier(n_estimators=100, random_state=42),
    'Gradient Boosting':   GradientBoostingClassifier(n_estimators=100, random_state=42),
    'SVM':                 SVC(kernel='rbf', random_state=42),
    'KNN':                 KNeighborsClassifier(n_neighbors=5),
    'Logistic Regression': LogisticRegression(max_iter=1000, random_state=42),
}

REGRESSORS = {
    'Random Forest':       RandomForestRegressor(n_estimators=100, random_state=42),
    'Gradient Boosting':   GradientBoostingRegressor(n_estimators=100, random_state=42),
    'Linear Regression':   LinearRegression(),
    'Ridge Regression':    Ridge(alpha=1.0),
    'SVR':                 SVR(kernel='rbf'),
}

all_results = {}

for task in TASKS:
    name = task['name']
    feats = task['features']
    print(f"\n{'─'*65}")
    print(f"  {name}  ({task['type']})")
    print(f"{'─'*65}")

    # Build X — always plain numpy float64
    df_sub = df[feats].dropna()
    X = np.asarray(df_sub, dtype=np.float64)

    # Build y
    if 'label_fn' in task:
        y = np.array([task['label_fn'](df.loc[i]) for i in df_sub.index])
    else:
        y = np.asarray(df.loc[df_sub.index, task['target']], dtype=np.float64)

    scaler = StandardScaler()
    X_sc = scaler.fit_transform(X)

    models = CLASSIFIERS if task['type'] == 'classification' else REGRESSORS
    metric = 'accuracy' if task['type'] == 'classification' else 'r2'

    task_res = {}
    for mname, model in models.items():
        scores = cross_val_score(model, X_sc, y, cv=5, scoring=metric)
        mean_s = float(scores.mean())
        std_s = float(scores.std())
        marker = "  ✓ selected" if mname == task['selected'] else ""
        print(f"  {mname:<22}  {mean_s:.4f} ± {std_s:.4f}{marker}")
        task_res[mname] = {'mean': round(mean_s, 4), 'std': round(std_s, 4)}

    best = max(task_res, key=lambda k: task_res[k]['mean'])
    all_results[name] = {
        'type':     task['type'],
        'metric':   metric,
        'models':   task_res,
        'selected': task['selected'],
        'best_cv':  best,
        'score':    task['score'],
    }

# ── Save JSON ─────────────────────────────────────────────────────
with open('model_comparison_results.json', 'w') as f:
    json.dump(all_results, f, indent=2)

# ── Summary ───────────────────────────────────────────────────────
print(f"\n{'='*65}")
print("  SUMMARY — Selected Algorithm Per Task")
print(f"{'='*65}")
print(f"  {'Task':<25} {'Selected':<22} {'Score':>8}  Metric")
print(f"  {'─'*60}")
for tname, res in all_results.items():
    sel = res['selected']
    score = res['models'][sel]['mean']
    metric = res['metric'].upper()
    flag = "  ← best" if sel == res['best_cv'] else f"  (best: {res['best_cv']})"
    print(f"  {tname:<25} {sel:<22} {score:>8.4f}  {metric}{flag}")

print(f"\n✓ Saved model_comparison_results.json")
print(f"  Use this table in your report — Section: Model Selection & Evaluation")
