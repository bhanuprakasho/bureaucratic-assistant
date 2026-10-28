import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'processed', 'combined_spam_dataset.csv')
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models', 'scam_detection_pipeline.joblib')

def evaluate():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model artifact not found at {MODEL_PATH}. Run scripts/train_scam_model.py first.")
    
    print(f"Loading model from {MODEL_PATH}...")
    pipeline = joblib.load(MODEL_PATH)
    
    print(f"Loading test split from {DATA_PATH}...")
    df = pd.read_csv(DATA_PATH)
    df['target'] = (df['label'] == 'spam').astype(int)
    
    X = [str(m) for m in df['message']]
    y = np.array(df['target'].tolist(), dtype=int)
    
    # Exact same 80/20 stratified split
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    
    print(f"Evaluating model on {len(X_test)} held-out test samples...")
    y_pred = pipeline.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, pos_label=1)
    rec = recall_score(y_test, y_pred, pos_label=1)
    f1 = f1_score(y_test, y_pred, pos_label=1)
    cm = confusion_matrix(y_test, y_pred)
    
    print("\n================ EVALUATION REPORT ================")
    print(f"Accuracy:  {acc * 100:.2f}%")
    print(f"Precision (Spam): {prec * 100:.2f}%")
    print(f"Recall (Spam):    {rec * 100:.2f}%")
    print(f"F1-Score (Spam):  {f1 * 100:.2f}%")
    print("\nConfusion Matrix:")
    print(f"  TN (Correct Ham):  {cm[0][0]}")
    print(f"  FP (False Alarm):  {cm[0][1]}")
    print(f"  FN (Missed Spam):  {cm[1][0]}")
    print(f"  TP (Caught Spam):  {cm[1][1]}")
    print("===================================================\n")
    print(classification_report(y_test, y_pred, target_names=['Ham (Legitimate)', 'Spam (Scam)']))

if __name__ == "__main__":
    evaluate()
