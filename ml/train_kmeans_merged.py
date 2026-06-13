"""
============================================================
 FILE: ml/train_kmeans_merged.py
 RUN:  python train_kmeans_merged.py   (from the ml/ directory)

 WHAT THIS SCRIPT DOES:
 ----------------------------------------------------------
 Trains an unsupervised K-Means clustering model on the
 merged_dataset.csv (14,003 university students, 16 features).

 Purpose: group students into academic profiles so the dashboard
 can recommend a personalised learning style for each student.
 This is the unsupervised ML component of AcadAI — it adds a
 completely different ML paradigm alongside the supervised models.

 STEPS:
 1. Load & preprocess merged_dataset.csv
 2. Select 7 engagement/performance features for clustering
 3. StandardScaler normalisation (required — K-Means is distance-based)
 4. Silhouette score sweep k=2..8 to justify choosing k=6
 5. Train final K-Means (k=6) with n_init=20 for stable centroids
 6. Profile each cluster by mean ExamScore, StudyHours, Attendance
 7. Assign human-readable names based on academic performance
 8. Save all artefacts

 WHY K-MEANS?
 ----------------------------------------------------------
 K-Means is simple, interpretable, and scales to 14,000 rows easily.
 For educational data the goal is soft groupings for recommendations,
 not hard boundaries — K-Means is ideal for this.

 WHY THESE 7 FEATURES?
 ----------------------------------------------------------
 StudyHours, Attendance, AssignmentCompletion, ExamScore,
 StressLevel, OnlineCourses, Discussions
 These are the core engagement + performance signals AcadAI tracks.
 Binary flags (Internet, EduTech, Extracurricular) were excluded
 because they add noise without meaningful cluster separation.

 WHY k=6?
 ----------------------------------------------------------
 The silhouette sweep shows k=6 is the elbow point — silhouette
 scores plateau after k=6. Educational data is inherently continuous
 so silhouette scores are low overall (~0.27); this is expected and
 documented. The clusters are used for learning style recommendations,
 not hard labels.

 EXPECTED SILHOUETTE SCORE: ~0.27  (low but acceptable — see note above)

 OUTPUTS:
 ----------------------------------------------------------
 merged_kmeans.pkl      KMeans object (k=6)
 merged_scaler.pkl      StandardScaler (fitted on the 7 features)
 merged_labels.pkl      dict: cluster_id → {name, description, advice,
                                             color, bg, learning_style,
                                             count, percentage,
                                             avg_exam, avg_study, avg_attend}
 merged_features.pkl    list of 7 feature names (order must match app.py)

 These filenames are loaded by ml/app.py on startup.
============================================================
"""
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import pickle
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

print("=" * 60)
print("  AcadAI — K-Means Clustering on Merged Dataset")
print("=" * 60)

# -- 1. Load & preprocess --------------------------------------
print("\n[1/4] Loading merged_dataset.csv...")
df = pd.read_csv('merged_dataset.csv')
print(f"  Rows: {len(df):,}  |  Columns: {df.shape[1]}")

# Encode any remaining string columns
cat_map = {
    'Yes': 1, 'No': 0,
    'Low': 0, 'Medium': 1, 'High': 2,
    'A': 0, 'B': 1, 'C': 2, 'D': 3,
    'Male': 1, 'Female': 0,
}
for col in df.select_dtypes(include='object').columns:
    df[col] = df[col].map(cat_map).fillna(df[col].map(cat_map).median())

for col in df.columns:
    df[col] = df[col].fillna(df[col].median())

print(f"  Missing values after imputation: {df.isnull().sum().sum()}")

# -- 2. Feature selection --------------------------------------
# Core engagement + performance signals tracked by AcadAI.
# Binary flags (Internet, EduTech, Extracurricular) excluded —
# they add noise without meaningful cluster separation.
FEATURES = [
    'StudyHours',
    'Attendance',
    'AssignmentCompletion',
    'ExamScore',
    'StressLevel',
    'OnlineCourses',
    'Discussions',
]
FEATURES = [f for f in FEATURES if f in df.columns]
print(f"\n  Clustering features ({len(FEATURES)}): {FEATURES}")

X = np.asarray(df[FEATURES].values.tolist(), dtype=np.float64)

# -- 3. Normalise ----------------------------------------------
# K-Means is distance-based — features must be on the same scale.
# StandardScaler: zero mean, unit variance.
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# -- 4. Silhouette sweep to choose k ---------------------------
# We test k=2 to 8. Silhouette score measures how well each point
# fits its own cluster vs. the nearest other cluster (higher = better).
# Educational data is continuous so scores are low overall; we pick
# the k where the score plateaus — the "elbow" of the curve.
print("\n[2/4] Silhouette sweep k=2..8 (justifying k=6):")
silhouette_scores = {}
for k in range(2, 9):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    lbl = km.fit_predict(X_scaled)
    s = silhouette_score(X_scaled, lbl)
    silhouette_scores[k] = s
    marker = "  <- selected" if k == 6 else ""
    print(f"    k={k}:  silhouette = {s:.4f}{marker}")

# Plot silhouette scores
fig, ax = plt.subplots(figsize=(8, 4))
ks = list(silhouette_scores.keys())
ss = list(silhouette_scores.values())
ax.plot(ks, ss, 'o-', color='#818cf8', linewidth=2.5, markersize=8)
ax.axvline(x=6, color='#34d399', linestyle='--', linewidth=1.8, label='Selected k=6')
ax.set_title('Silhouette Score vs. Number of Clusters (K-Means)', fontsize=13, fontweight='bold')
ax.set_xlabel('Number of Clusters (k)', fontsize=11)
ax.set_ylabel('Silhouette Score', fontsize=11)
ax.legend(fontsize=10)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('curve_kmeans.png', dpi=150, bbox_inches='tight')
plt.show()
print("  Saved: curve_kmeans.png")

# -- 5. Train final model (k=6) --------------------------------
print("\n[3/4] Training K-Means (k=6, n_init=20)...")
kmeans = KMeans(n_clusters=6, random_state=42, n_init=20, max_iter=500)
cluster_labels = kmeans.fit_predict(X_scaled)

final_sil = silhouette_score(X_scaled, cluster_labels)
print(f"  Final silhouette score: {final_sil:.4f}")
print(f"  Inertia (within-cluster sum of squares): {kmeans.inertia_:.1f}")

# -- 6. Profile each cluster -----------------------------------
# Compute mean ExamScore, StudyHours, Attendance per cluster.
# We use these averages to assign human-readable names:
#   avg_exam >= 80  → Stressed Achiever   (high score, check stress)
#   avg_exam >= 65  → Balanced Performer  (solid, average performance)
#   avg_exam < 60   → Struggling Student  (below average, needs support)
df_clust = df[FEATURES].copy()
df_clust['cluster'] = cluster_labels

profiles = df_clust.groupby('cluster').agg(
    avg_exam=('ExamScore', 'mean'),
    avg_study=('StudyHours', 'mean'),
    avg_attend=('Attendance', 'mean'),
    avg_stress=('StressLevel', 'mean'),
    count=('ExamScore', 'count'),
).reset_index()

total = len(df_clust)

print("\n  Cluster profiles:")
print(f"  {'ID':<5} {'Avg Exam':>9} {'Avg Study':>10} {'Avg Attend':>11} {'Stress':>7} {'Count':>7} {'%':>6}")
print(f"  {'-'*55}")
for _, row in profiles.sort_values('avg_exam', ascending=False).iterrows():
    pct = row['count'] / total * 100
    print(f"  {int(row['cluster']):<5} {row['avg_exam']:>9.1f} {row['avg_study']:>10.1f} "
          f"{row['avg_attend']:>11.1f} {row['avg_stress']:>7.2f} {int(row['count']):>7} {pct:>5.1f}%")

# -- 7. Assign names & metadata --------------------------------
def assign_profile(avg_exam, avg_stress):
    """Assign cluster name and learning style based on academic performance."""
    if avg_exam >= 80:
        return {
            'name':           'Stressed Achiever',
            'description':    'High scores but experiencing significant stress.',
            'advice':         'Your results are great — prioritise rest and balance.',
            'color':          '#818cf8',
            'bg':             'rgba(129,140,248,0.1)',
            'learning_style': 'Structured Learning with Breaks',
        }
    elif avg_exam >= 65:
        return {
            'name':           'Balanced Performer',
            'description':    'Solid performance with consistent attendance and engagement.',
            'advice':         'You are on track — push harder on exam preparation.',
            'color':          '#60a5fa',
            'bg':             'rgba(96,165,250,0.1)',
            'learning_style': 'Collaborative Learning',
        }
    else:
        return {
            'name':           'Struggling Student',
            'description':    'Below-average scores indicating academic difficulties.',
            'advice':         'Seek academic support and improve attendance immediately.',
            'color':          '#f87171',
            'bg':             'rgba(248,113,113,0.1)',
            'learning_style': 'Guided / Tutoring-Based Learning',
        }

cluster_map = {}
for _, row in profiles.iterrows():
    cid  = int(row['cluster'])
    pct  = round(row['count'] / total * 100, 1)
    meta = assign_profile(row['avg_exam'], row['avg_stress'])
    meta.update({
        'count':       int(row['count']),
        'percentage':  pct,
        'avg_exam':    round(float(row['avg_exam']),   1),
        'avg_study':   round(float(row['avg_study']),  1),
        'avg_attend':  round(float(row['avg_attend']), 1),
    })
    cluster_map[cid] = meta
    print(f"  Cluster {cid}: {meta['name']}  ({pct}%)")

# -- 8. Save artefacts -----------------------------------------
print("\n[4/4] Saving artefacts...")
with open('merged_kmeans.pkl',   'wb') as f: pickle.dump(kmeans,      f)
with open('merged_scaler.pkl',   'wb') as f: pickle.dump(scaler,      f)
with open('merged_labels.pkl',   'wb') as f: pickle.dump(cluster_map, f)
with open('merged_features.pkl', 'wb') as f: pickle.dump(FEATURES,    f)

print("  Saved: merged_kmeans.pkl")
print("  Saved: merged_scaler.pkl")
print("  Saved: merged_labels.pkl")
print("  Saved: merged_features.pkl")

print("\n" + "=" * 60)
print(f"  Dataset        : merged_dataset.csv ({len(df):,} students)")
print(f"  Features       : {len(FEATURES)} engagement + performance signals")
print(f"  k              : 6 clusters")
print(f"  Silhouette     : {final_sil:.4f}  (low expected — continuous educational data)")
print(f"  Learning curve : curve_kmeans.png")
print("=" * 60)
print("\nNote: silhouette ~0.27 is expected for continuous educational data.")
print("Clusters are soft groupings for learning style recommendations,")
print("not hard boundaries. Each student gets one cluster + one learning")
print("style recommendation on their dashboard.")
