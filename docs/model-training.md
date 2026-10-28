# Machine Learning Model Training & Evaluation Report

## 1. Feature Engineering & Pipelines

Text messages are processed using a Scikit-learn Pipeline with:
1. **TF-IDF Vectorization:**
   - Sublinear term frequency scaling (`sublinear_tf=True`).
   - N-gram range: Unigrams and Bigrams `(1, 2)`.
   - English stop-words removal.
   - Max features: 5,000 vocabulary terms.
2. **Candidate Classifiers:**
   - **Candidate A:** `MultinomialNB(alpha=0.1)`
   - **Candidate B:** `LogisticRegression(C=5.0, max_iter=1000, class_weight='balanced', random_state=42)`

---

## 2. Model Selection Rationale

In bureaucratic and citizen safety contexts, the primary objective is minimizing **False Negatives** (failing to detect a fraudulent notice). A citizen who believes a fraudulent notice is genuine may suffer irreversible financial fraud or identity theft.

| Model Candidate | Accuracy | Spam Precision | Spam Recall | Spam F1-Score | Macro F1-Score |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Multinomial Naive Bayes** | 98.84% | **99.17%** | 91.60% | 95.24% | 97.29% |
| **Logistic Regression (Selected)** | 98.46% | 91.97% | **96.18%** | 94.03% | 96.57% |

### Decision
While Naive Bayes achieves slightly higher precision, **Logistic Regression achieves 96.18% recall** on the held-out test set (missing only 5 out of 131 spam lures, compared to 11 missed by Naive Bayes).

Because missing fraudulent attacks is significantly more harmful than a minor increase in false alerts, **Logistic Regression with balanced class weights was selected and serialized** to `models/scam_detection_pipeline.joblib`.

---

## 3. Detailed Confusion Matrix (Held-Out Test Set = 1,036 Samples)

```text
                     Predicted Negative (Ham)    Predicted Positive (Spam)
Actual Negative (Ham)          894 (TN)                     11 (FP)
Actual Positive (Spam)           5 (FN)                    126 (TP)
```

- **True Negatives (TN):** 894 genuine notices correctly identified.
- **False Positives (FP):** 11 genuine notices flagged for extra scrutiny.
- **False Negatives (FN):** Only 5 spam messages missed.
- **True Positives (TP):** 126 scam lures successfully intercepted.

---

## 4. Model Limitations & Mitigations

1. **SMS vs. Long-form Legal PDFs:** The model was trained on SMS lengths (under 500 characters). Long-form gazettes or multi-page legal documents have different token distributions.
2. **Adversarial Obfuscation:** Attackers who intentionally replace letters with cyrillic homoglyphs or use QR code images may evade n-gram matching.
3. **Mitigation:** The application never relies solely on the machine learning classifier. It pairs model probabilities with transparent domain rules (inspecting `.gov.in` vs `.xyz`/`.top` domains, urgent threats, and OTP demands).

---

## 5. Commands to Reproduce Training

Run the following commands in the workspace root:

```bash
# 1. Download dataset and prepare deduplicated CSV
python scripts/acquire_and_prepare_dataset.py

# 2. Train pipelines, compare candidates, and save joblib artifact
python scripts/train_scam_model.py

# 3. Verify reproduction of reported metrics on test split
python scripts/evaluate_scam_model.py
```
