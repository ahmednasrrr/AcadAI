import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, r2_score, mean_squared_error
from sklearn.utils import resample

np.random.seed(42)
n_samples = 2000

print("📊 Generating AcadAI Student Dataset...")

# ─────────────────────────────────────────
# 1. Generate realistic student data
# ─────────────────────────────────────────
data = {
    'gpa': np.round(np.random.uniform(0.5, 4.0, n_samples), 2),
    'login_frequency': np.random.randint(0, 30, n_samples),
    'assignments_submitted': np.random.randint(0, 20, n_samples),
    'assignments_missed': np.random.randint(0, 15, n_samples),
    'quizzes_taken': np.random.randint(0, 15, n_samples),
    'quizzes_missed': np.random.randint(0, 10, n_samples),
    'average_grade': np.round(np.random.uniform(20, 100, n_samples), 1),
}

df = pd.DataFrame(data)

# Make data realistic with noise
df['average_grade'] = (
    df['gpa'] * 15 +
    df['assignments_submitted'] * 0.8 -
    df['assignments_missed'] * 2.0 -
    df['quizzes_missed'] * 1.5 +
    df['login_frequency'] * 0.5 +
    np.random.normal(0, 10, n_samples)
).clip(20, 100).round(1)

df['gpa'] = (
    df['average_grade'] / 28 +
    np.random.normal(0, 0.4, n_samples)
).clip(0.5, 4.0).round(2)

print(f"✅ Generated {n_samples} student records")

# ─────────────────────────────────────────
# 2. Create Risk Labels
# ─────────────────────────────────────────
def assign_risk(row):
    score = 0

    if row['gpa'] < 1.5: score += 4
    elif row['gpa'] < 2.0: score += 3
    elif row['gpa'] < 2.5: score += 2
    elif row['gpa'] < 3.0: score += 1

    if row['assignments_missed'] >= 8: score += 4
    elif row['assignments_missed'] >= 5: score += 3
    elif row['assignments_missed'] >= 3: score += 2
    elif row['assignments_missed'] >= 1: score += 1

    if row['quizzes_missed'] >= 5: score += 3
    elif row['quizzes_missed'] >= 3: score += 2
    elif row['quizzes_missed'] >= 1: score += 1

    if row['average_grade'] < 40: score += 4
    elif row['average_grade'] < 55: score += 3
    elif row['average_grade'] < 65: score += 2
    elif row['average_grade'] < 75: score += 1

    if row['login_frequency'] < 3: score += 3
    elif row['login_frequency'] < 7: score += 2
    elif row['login_frequency'] < 12: score += 1

    if score >= 10: return 'High'
    elif score >= 5: return 'Medium'
    else: return 'Low'

df['risk_level'] = df.apply(assign_risk, axis=1)

# ─────────────────────────────────────────
# 3. Create Performance Trend Labels
# ─────────────────────────────────────────
def assign_trend(row):
    score = 0

    if row['gpa'] >= 3.5: score += 2
    elif row['gpa'] >= 3.0: score += 1
    elif row['gpa'] < 2.0: score -= 2
    elif row['gpa'] < 2.5: score -= 1

    submission_rate = row['assignments_submitted'] / (row['assignments_submitted'] + row['assignments_missed'] + 1)
    if submission_rate >= 0.8: score += 2
    elif submission_rate >= 0.6: score += 1
    elif submission_rate < 0.4: score -= 2
    elif submission_rate < 0.6: score -= 1

    if row['login_frequency'] >= 20: score += 1
    elif row['login_frequency'] < 5: score -= 1

    if score >= 3: return 'Improving'
    elif score <= -2: return 'Declining'
    else: return 'Stable'

df['trend'] = df.apply(assign_trend, axis=1)

# ─────────────────────────────────────────
# 4. Create Study Time Labels
# ─────────────────────────────────────────
def assign_studytime(row):
    if row['gpa'] < 2.0 or row['average_grade'] < 50:
        return 4
    elif row['gpa'] < 2.5 or row['average_grade'] < 65:
        return 3
    elif row['gpa'] < 3.0 or row['average_grade'] < 75:
        return 2
    else:
        return 2

df['recommended_studytime'] = df.apply(assign_studytime, axis=1)

# ─────────────────────────────────────────
# 5. Create Dropout Labels
# ─────────────────────────────────────────
def assign_dropout(row):
    if row['gpa'] < 1.5 and row['assignments_missed'] >= 5:
        return 'High Risk'
    elif row['gpa'] < 2.0 or row['assignments_missed'] >= 8 or row['quizzes_missed'] >= 6:
        return 'High Risk'
    elif row['gpa'] < 2.5 or row['assignments_missed'] >= 4 or row['average_grade'] < 50:
        return 'Medium Risk'
    else:
        return 'Low Risk'

df['dropout_risk'] = df.apply(assign_dropout, axis=1)

# ─────────────────────────────────────────
# 6. Add 10% label noise for realism
# ─────────────────────────────────────────
print("\n🔀 Adding label noise for realism...")

noise_idx = np.random.choice(df.index, size=int(0.10 * len(df)), replace=False)
risk_labels = ['Low', 'Medium', 'High']
df.loc[noise_idx, 'risk_level'] = np.random.choice(risk_labels, size=len(noise_idx))

noise_idx2 = np.random.choice(df.index, size=int(0.10 * len(df)), replace=False)
trend_labels = ['Improving', 'Stable', 'Declining']
df.loc[noise_idx2, 'trend'] = np.random.choice(trend_labels, size=len(noise_idx2))

noise_idx3 = np.random.choice(df.index, size=int(0.10 * len(df)), replace=False)
dropout_labels = ['Low Risk', 'Medium Risk', 'High Risk']
df.loc[noise_idx3, 'dropout_risk'] = np.random.choice(dropout_labels, size=len(noise_idx3))

noise_idx4 = np.random.choice(df.index, size=int(0.10 * len(df)), replace=False)
df.loc[noise_idx4, 'recommended_studytime'] = np.random.choice([1, 2, 3, 4], size=len(noise_idx4))

print("\n📊 Risk Distribution after noise:")
print(df['risk_level'].value_counts())
print("\n📊 Trend Distribution after noise:")
print(df['trend'].value_counts())
print("\n📊 Study Time Distribution after noise:")
print(df['recommended_studytime'].value_counts().sort_index())
print("\n📊 Dropout Distribution after noise:")
print(df['dropout_risk'].value_counts())

# ─────────────────────────────────────────
# 7. Save dataset
# ─────────────────────────────────────────
df.to_csv('acadai_dataset.csv', index=False)
print("\n💾 Dataset saved as acadai_dataset.csv")

# ─────────────────────────────────────────
# 8. Train all models
# ─────────────────────────────────────────
FEATURES = [
    'gpa', 'login_frequency', 'assignments_submitted',
    'assignments_missed', 'quizzes_taken', 'quizzes_missed',
    'average_grade'
]

print("\n🔧 Training models on AcadAI dataset...")

# ── Risk Model ──
low = df[df['risk_level'] == 'Low']
medium = df[df['risk_level'] == 'Medium']
high = df[df['risk_level'] == 'High']
max_size = max(len(low), len(medium), len(high))
df_risk = pd.concat([
    resample(low, replace=True, n_samples=max_size, random_state=42),
    resample(medium, replace=True, n_samples=max_size, random_state=42),
    resample(high, replace=True, n_samples=max_size, random_state=42),
])
X_train, X_test, y_train, y_test = train_test_split(
    df_risk[FEATURES], df_risk['risk_level'], test_size=0.2, random_state=42
)
risk_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
risk_model.fit(X_train, y_train)
y_pred = risk_model.predict(X_test)
print(f"\n✅ Risk Model Accuracy: {accuracy_score(y_test, y_pred) * 100:.2f}%")
print(classification_report(y_test, y_pred))

# ── Grade Model ──
X_train, X_test, y_train, y_test = train_test_split(
    df[FEATURES], df['average_grade'], test_size=0.2, random_state=42
)
grade_model = LinearRegression()
grade_model.fit(X_train, y_train)
y_pred = grade_model.predict(X_test)
r2 = r2_score(y_test, y_pred)
print(f"✅ Grade Model R²: {r2:.4f}")

# ── Trend Model ──
improving = df[df['trend'] == 'Improving']
declining = df[df['trend'] == 'Declining']
stable = df[df['trend'] == 'Stable']
max_trend = max(len(improving), len(declining), len(stable))
df_trend = pd.concat([
    resample(improving, replace=True, n_samples=max_trend, random_state=42),
    resample(declining, replace=True, n_samples=max_trend, random_state=42),
    resample(stable, replace=True, n_samples=max_trend, random_state=42),
])
X_train, X_test, y_train, y_test = train_test_split(
    df_trend[FEATURES], df_trend['trend'], test_size=0.2, random_state=42
)
trend_model = RandomForestClassifier(n_estimators=200, random_state=42, max_depth=12)
trend_model.fit(X_train, y_train)
y_pred = trend_model.predict(X_test)
print(f"✅ Trend Model Accuracy: {accuracy_score(y_test, y_pred) * 100:.2f}%")
print(classification_report(y_test, y_pred))

# ── Study Time Model ──
X_train, X_test, y_train, y_test = train_test_split(
    df[FEATURES], df['recommended_studytime'], test_size=0.2, random_state=42
)
studytime_model = RandomForestRegressor(n_estimators=100, random_state=42, max_depth=10)
studytime_model.fit(X_train, y_train)
y_pred = studytime_model.predict(X_test)
print(f"✅ Study Time Model R²: {r2_score(y_test, y_pred):.4f}")

# ── Dropout Model ──
d_low = df[df['dropout_risk'] == 'Low Risk']
d_med = df[df['dropout_risk'] == 'Medium Risk']
d_high = df[df['dropout_risk'] == 'High Risk']
max_d = max(len(d_low), len(d_med), len(d_high))
df_dropout = pd.concat([
    resample(d_low, replace=True, n_samples=max_d, random_state=42),
    resample(d_med, replace=True, n_samples=max_d, random_state=42),
    resample(d_high, replace=True, n_samples=max_d, random_state=42),
])
X_train, X_test, y_train, y_test = train_test_split(
    df_dropout[FEATURES], df_dropout['dropout_risk'], test_size=0.2, random_state=42
)
dropout_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
dropout_model.fit(X_train, y_train)
y_pred = dropout_model.predict(X_test)
print(f"✅ Dropout Model Accuracy: {accuracy_score(y_test, y_pred) * 100:.2f}%")
print(classification_report(y_test, y_pred))

# ─────────────────────────────────────────
# 9. Save all models
# ─────────────────────────────────────────
with open('risk_model.pkl', 'wb') as f:
    pickle.dump(risk_model, f)
with open('grade_model.pkl', 'wb') as f:
    pickle.dump(grade_model, f)
with open('trend_model.pkl', 'wb') as f:
    pickle.dump(trend_model, f)
with open('studytime_model.pkl', 'wb') as f:
    pickle.dump(studytime_model, f)
with open('dropout_model.pkl', 'wb') as f:
    pickle.dump(dropout_model, f)
with open('feature_names.pkl', 'wb') as f:
    pickle.dump(FEATURES, f)

print("\n💾 All models saved!")
print("\n🎉 AcadAI ML Pipeline Complete!")
print("=" * 50)
print("Dataset: acadai_dataset.csv (2000 students)")
print("Features: gpa, login_frequency, assignments_submitted,")
print("          assignments_missed, quizzes_taken,")
print("          quizzes_missed, average_grade")