import os
import sys
import json
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models', 'scam_detection_pipeline.joblib')

def predict(text):
    if not os.path.exists(MODEL_PATH):
        return {
            "error": f"Model artifact not found at {MODEL_PATH}",
            "fallback": True
        }
    
    try:
        pipeline = joblib.load(MODEL_PATH)
        pred_label_idx = int(pipeline.predict([text])[0])
        label = "spam" if pred_label_idx == 1 else "ham"
        
        # Get probabilities if available
        if hasattr(pipeline, "predict_proba"):
            probs = pipeline.predict_proba([text])[0]
            spam_prob = round(float(probs[1]), 4)
            ham_prob = round(float(probs[0]), 4)
        else:
            spam_prob = 1.0 if label == "spam" else 0.0
            ham_prob = 1.0 - spam_prob
            
        confidence = "High" if max(spam_prob, ham_prob) >= 0.85 else ("Medium" if max(spam_prob, ham_prob) >= 0.65 else "Low")
        
        return {
            "success": True,
            "prediction": label,
            "spam_probability": spam_prob,
            "ham_probability": ham_prob,
            "confidence": confidence,
            "model_name": "Logistic Regression (TF-IDF)",
            "is_ml_prediction": True
        }
    except Exception as e:
        return {
            "error": str(e),
            "fallback": True,
            "is_ml_prediction": False
        }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
    else:
        # Read from stdin
        input_text = sys.stdin.read()
    
    result = predict(input_text.strip())
    print(json.dumps(result))
