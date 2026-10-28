# Machine Learning Models Directory

```text
models/
├── scam_detection_pipeline.joblib   # Trained Scikit-learn Pipeline (TF-IDF + Logistic Regression)
└── model_metrics.json               # Portable metrics JSON from held-out 20% test split
```

## Model Architecture
- **Pipeline:** `sklearn.pipeline.Pipeline`
- **Vectorizer:** `TfidfVectorizer(ngram_range=(1,2), max_features=5000, sublinear_tf=True, stop_words='english')`
- **Classifier:** `LogisticRegression(C=5.0, max_iter=1000, class_weight='balanced', random_state=42)`

## Performance on Held-Out Test Set (1,036 Samples)
- **Accuracy:** 98.46%
- **Spam Precision:** 91.97%
- **Spam Recall:** 96.18%
- **Spam F1-Score:** 94.03%

## Loading & Retraining
```bash
# Retrain model
python scripts/train_scam_model.py

# Evaluate model
python scripts/evaluate_scam_model.py

# Single-message CLI inference
python scripts/predict_scam.py "Your message here"
```
