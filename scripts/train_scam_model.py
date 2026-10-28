import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'processed', 'combined_spam_dataset.csv')
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

MODEL_OUTPUT_PATH = os.path.join(MODELS_DIR, 'scam_detection_pipeline.joblib')
METRICS_OUTPUT_PATH = os.path.join(MODELS_DIR, 'model_metrics.json')

def train_and_evaluate():
    print(f"Loading cleaned dataset from {DATA_PATH}...")
    df = pd.read_csv(DATA_PATH)
    
    # Binary label encoding: ham -> 0, spam -> 1
    df['target'] = (df['label'] == 'spam').astype(int)
    
    X = [str(m) for m in df['message']]
    y = np.array(df['target'].tolist(), dtype=int)
    
    # 80/20 Stratified train-test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    
    print(f"Dataset split: Train samples = {len(X_train)}, Test samples = {len(X_test)}")
    print(f"Test class distribution: Ham = {(y_test == 0).sum()}, Spam = {(y_test == 1).sum()}")
    
    # Define Candidate 1: TF-IDF + Multinomial Naive Bayes
    pipeline_nb = Pipeline([
        ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=5000, sublinear_tf=True, stop_words='english')),
        ('nb', MultinomialNB(alpha=0.1))
    ])
    
    # Define Candidate 2: TF-IDF + Logistic Regression
    pipeline_lr = Pipeline([
        ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=5000, sublinear_tf=True, stop_words='english')),
        ('lr', LogisticRegression(C=5.0, max_iter=1000, class_weight='balanced', random_state=42))
    ])
    
    print("\nTraining Multinomial Naive Bayes pipeline...")
    pipeline_nb.fit(X_train, y_train)
    y_pred_nb = pipeline_nb.predict(X_test)
    
    print("Training Logistic Regression pipeline...")
    pipeline_lr.fit(X_train, y_train)
    y_pred_lr = pipeline_lr.predict(X_test)
    
    # Metrics computation
    def compute_metrics(y_true, y_pred, model_name):
        cm = confusion_matrix(y_true, y_pred).tolist()
        return {
            "model_name": model_name,
            "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
            "spam_precision": round(float(precision_score(y_true, y_pred, pos_label=1)), 4),
            "spam_recall": round(float(recall_score(y_true, y_pred, pos_label=1)), 4),
            "spam_f1": round(float(f1_score(y_true, y_pred, pos_label=1)), 4),
            "macro_f1": round(float(f1_score(y_true, y_pred, average='macro')), 4),
            "confusion_matrix": {
                "true_negative": cm[0][0],
                "false_positive": cm[0][1],
                "false_negative": cm[1][0],
                "true_positive": cm[1][1]
            }
        }
        
    metrics_nb = compute_metrics(y_test, y_pred_nb, "Multinomial Naive Bayes (TF-IDF)")
    metrics_lr = compute_metrics(y_test, y_pred_lr, "Logistic Regression (TF-IDF)")
    
    print("\n--- Model Comparison on Held-Out Test Set (20% = 1,036 samples) ---")
    print(f"MultinomialNB:       Accuracy={metrics_nb['accuracy']:.4f}, Recall={metrics_nb['spam_recall']:.4f}, Precision={metrics_nb['spam_precision']:.4f}, F1={metrics_nb['spam_f1']:.4f}")
    print(f"Logistic Regression: Accuracy={metrics_lr['accuracy']:.4f}, Recall={metrics_lr['spam_recall']:.4f}, Precision={metrics_lr['spam_precision']:.4f}, F1={metrics_lr['spam_f1']:.4f}")
    
    # For citizen protection against fraudulent notices, high recall is crucial to minimize False Negatives
    # Logistic Regression with class_weight='balanced' achieves higher spam recall
    best_pipeline = pipeline_lr if metrics_lr['spam_recall'] >= metrics_nb['spam_recall'] else pipeline_nb
    selected_name = "Logistic Regression (TF-IDF)" if best_pipeline == pipeline_lr else "Multinomial Naive Bayes (TF-IDF)"
    print(f"\nSelected Model for Deployment: {selected_name}")
    
    # Save the fitted pipeline
    joblib.dump(best_pipeline, MODEL_OUTPUT_PATH)
    print(f"Saved model pipeline to: {MODEL_OUTPUT_PATH}")
    
    # Generate portable metrics JSON
    metrics_payload = {
        "dataset": {
            "source": "UCI SMS Spam Collection + Synthetic Indian Bureaucratic Lures",
            "cleaned_records": len(df),
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "test_split_ratio": 0.20,
            "random_seed": 42
        },
        "selected_model": selected_name,
        "model_artifact": "models/scam_detection_pipeline.joblib",
        "models_compared": [
            metrics_nb,
            metrics_lr
        ],
        "deployed_metrics": metrics_lr if selected_name == "Logistic Regression (TF-IDF)" else metrics_nb,
        "limitations": [
            "Dataset represents SMS messages; long-form official letters or complex phishing PDFs may differ in distribution.",
            "Zero-day adversarial prompt variations or unfamiliar obfuscated links require ongoing updating and retraining.",
            "Predictions must always be presented with uncertainty levels and complementary rule-based domain checks."
        ]
    }
    
    with open(METRICS_OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"Saved portable metrics JSON to: {METRICS_OUTPUT_PATH}")

if __name__ == "__main__":
    train_and_evaluate()
