"""
============================================================
 FILE: ml/ml_models.py
 PURPOSE: Shared class definitions imported by BOTH training AND serving.

 WHY THIS FILE EXISTS:
 ──────────────────────────────────────────────────────────
 When Python pickles an object it stores the full module path of the class,
 e.g. "ml_models.ThresholdedEnsemble".
 If the class were defined inline in train_all_merged.py, pickle would store
 "__main__.ThresholdedEnsemble" — and app.py (which is not __main__) could
 never deserialise it, crashing Flask on startup.
 Defining the class here makes the module path stable for both scripts.

 CLASSES:
 ──────────────────────────────────────────────────────────
 ThresholdedEnsemble   – wraps a VotingClassifier with a custom High-risk
                         probability threshold (found optimal at 0.35).
                         .predict()      → applies threshold, returns string labels
                         .predict_proba() → raw probabilities from VotingClassifier
                         .classes_       → ['High', 'Low', 'Medium']

 apply_threshold()     – standalone function:
                         if P(High) >= threshold → predict High
                         else → argmax as normal
============================================================
"""
import numpy as np


def apply_threshold(proba, high_idx, threshold):
    """Predict High-risk when P(High) >= threshold, otherwise use argmax."""
    preds = np.argmax(proba, axis=1).copy()
    preds[proba[:, high_idx] >= threshold] = high_idx
    return preds


class ThresholdedEnsemble:
    """VotingClassifier wrapper with a custom High-risk probability threshold."""

    def __init__(self, clf, le, high_idx, threshold):
        self.clf       = clf
        self.le        = le
        self.high_idx  = high_idx
        self.threshold = threshold

    def predict(self, X):
        proba = self.clf.predict_proba(X)
        enc   = apply_threshold(proba, self.high_idx, self.threshold)
        return self.le.inverse_transform(enc)

    def predict_proba(self, X):
        return self.clf.predict_proba(X)

    @property
    def classes_(self):
        return self.le.classes_
