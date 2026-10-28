const { spawn } = require('child_process');
const path = require('path');
const { db } = require('../database/database');

const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
const PREDICT_SCRIPT = path.resolve(__dirname, '../../scripts/predict_scam.py');

// Promise helpers for DB
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

/**
 * Runs Python ML inference subprocess on the input message.
 * Returns honest ML result or null if Python invocation fails.
 */
function runPythonModelInference(messageText) {
  return new Promise((resolve) => {
    try {
      const child = spawn(PYTHON_BIN, [PREDICT_SCRIPT, messageText]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout.trim());
            return resolve(parsed);
          } catch (e) {
            console.warn('Failed to parse ML output JSON:', stdout);
            return resolve(null);
          }
        } else {
          console.warn(`Python ML inference exited with code ${code}:`, stderr);
          return resolve(null);
        }
      });

      child.on('error', (err) => {
        console.warn('Could not launch Python subprocess:', err.message);
        return resolve(null);
      });
    } catch (err) {
      console.warn('Exception spawning Python process:', err.message);
      return resolve(null);
    }
  });
}

// POST /api/scam/analyze
exports.analyzeScam = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message or notice text to analyze.'
      });
    }

    const text = message.trim();
    const detectedFlags = [];
    let ruleRiskPoints = 0;

    // Rule 1: Immediate Payment Demands
    if (/pay|payment|transfer|fee|charges|fine|penalty|deposit|claim fee|activation fee/i.test(text) && 
        /immediately|urgent|today|now|within \d+|hours|rs\.?|₹|\$/i.test(text)) {
      detectedFlags.push('Requests immediate fee payment or monetary transfer under tight deadline');
      ruleRiskPoints += 30;
    } else if (/pay|payment|deposit|fee|rs\.?|₹/i.test(text)) {
      detectedFlags.push('Mentions payment or monetary transaction');
      ruleRiskPoints += 15;
    }

    // Rule 2: Demands for OTP, PIN, or Password (distinguishing security warnings from demands)
    const isSafetyWarning = /never ask(s)?\s+(for|to|over)?.*otp|do not share.*(otp|pin|password)|never share.*otp/i.test(text);
    if (!isSafetyWarning && /otp|one time password|pin|cvv|password|passcode|login details/i.test(text)) {
      detectedFlags.push('Demands sensitive credentials (OTP, PIN, or Password)');
      ruleRiskPoints += 40;
    } else if (isSafetyWarning) {
      detectedFlags.push('Contains official security advisory warning against disclosing OTP');
    }

    // Rule 3: Requests for Sensitive Banking or National ID Numbers
    if (/bank account|account number|debit card|credit card|aadhaar number|pan card number|ssn/i.test(text)) {
      detectedFlags.push('Requests sensitive identity or banking account details');
      ruleRiskPoints += 25;
    }

    // Rule 4: Urgency, Threats, or Unsolicited Grants
    if (/urgent|action required|suspended|blocked|deactivated|expire today|last date|congratulations|selected|won|lottery|lucky winner|subsidy granted/i.test(text)) {
      detectedFlags.push('Uses psychological urgency, threat of suspension, or unverified subsidy claims');
      ruleRiskPoints += 20;
    }

    // Rule 5: Domain & Link Inspection
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex) || [];

    if (urls.length > 0) {
      let hasOfficialDomain = false;
      let hasSuspiciousDomain = false;

      for (const urlStr of urls) {
        try {
          const parsedUrl = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
          const hostname = parsedUrl.hostname.toLowerCase();

          if (hostname.endsWith('.gov.in') || hostname.endsWith('.nic.in')) {
            hasOfficialDomain = true;
          } else {
            hasSuspiciousDomain = true;
            if (hostname.endsWith('.xyz') || hostname.endsWith('.top') || hostname.endsWith('.info') || 
                hostname.endsWith('.biz') || hostname.includes('tinyurl') || hostname.includes('bit.ly') ||
                hostname.includes('ngrok') || /\d+\.\d+\.\d+\.\d+/.test(hostname)) {
              ruleRiskPoints += 35;
              detectedFlags.push(`Suspicious / unofficial domain detected: ${hostname}`);
            } else {
              ruleRiskPoints += 15;
              detectedFlags.push(`Third-party non-government link detected: ${hostname}`);
            }
          }
        } catch (e) {
          ruleRiskPoints += 10;
        }
      }

      if (hasOfficialDomain) {
        detectedFlags.push('Verified official government domain reference (.gov.in / .nic.in)');
      }
    }

    // Execute Python ML model inference
    const mlResult = await runPythonModelInference(text);

    let mlPrediction = 'UNKNOWN';
    let mlProbability = null;
    let modelUsed = 'Rule-Based Fallback (Python ML Unavailable)';
    let isMlPrediction = false;

    if (mlResult && mlResult.success) {
      mlPrediction = mlResult.prediction;
      mlProbability = mlResult.spam_probability;
      modelUsed = mlResult.model_name || 'Logistic Regression (TF-IDF)';
      isMlPrediction = true;

      if (mlPrediction === 'spam') {
        detectedFlags.push(`Trained ML classifier detected spam/scam language patterns (Probability: ${(mlProbability * 100).toFixed(1)}%)`);
      } else {
        detectedFlags.push(`Trained ML classifier detected legitimate notice language patterns (Ham: ${((1 - mlProbability) * 100).toFixed(1)}%)`);
      }
    }

    // Calculate final composite score
    let compositeScore = ruleRiskPoints;
    if (isMlPrediction && mlProbability !== null) {
      compositeScore = Math.round((ruleRiskPoints * 0.55) + (mlProbability * 100 * 0.45));
    }
    compositeScore = Math.min(Math.max(compositeScore, 0), 100);

    // Risk level classification
    let riskLevel = 'LOW';
    if (compositeScore >= 50 || (isMlPrediction && mlPrediction === 'spam' && mlProbability > 0.8)) {
      riskLevel = 'HIGH';
    } else if (compositeScore >= 25 || (isMlPrediction && mlPrediction === 'spam')) {
      riskLevel = 'MEDIUM';
    }

    // Tailored actionable recommendation
    let recommendation = 'Always verify communications through official portals ending with .gov.in. Never share OTPs or passwords.';
    if (riskLevel === 'HIGH') {
      recommendation = 'DO NOT click links, send money, or disclose OTP/banking information. This message exhibits high-confidence indicators of a fraudulent phishing attempt.';
    } else if (riskLevel === 'MEDIUM') {
      recommendation = 'Proceed with caution. Check the official ministry portal independently before responding or paying any fee.';
    }

    const disclaimer = isMlPrediction 
      ? 'Assessment combines Logistic Regression TF-IDF model predictions with heuristic domain rules for academic demonstration. It does not replace official cyber safety verification.'
      : 'Assessment generated by deterministic keyword rules because Python ML pipeline was temporarily unreachable.';

    // Save to database
    const userId = req.user ? req.user.id : null;
    await dbRun(`
      INSERT INTO scam_reports
      (user_id, message_text, ml_prediction, ml_probability, model_used, risk_level, risk_score, flags, recommendation, disclaimer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      text,
      mlPrediction,
      mlProbability,
      modelUsed,
      riskLevel,
      compositeScore,
      JSON.stringify(detectedFlags),
      recommendation,
      disclaimer
    ]);

    return res.json({
      success: true,
      analyzedText: text,
      isMlPrediction,
      modelUsed,
      mlPrediction,
      mlProbability,
      riskLevel,
      riskScore: compositeScore,
      reasons: detectedFlags.length > 0 ? detectedFlags : ['No standard suspicious scam keywords detected.'],
      recommendation,
      disclaimer
    });

  } catch (error) {
    console.error('Error analyzing scam message:', error);
    return res.status(500).json({ success: false, message: 'Failed to analyze message', error: error.message });
  }
};

// GET /api/scam/reports - Retrieve saved scam analyses
exports.getSavedReports = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    let reports;
    if (userId) {
      reports = await dbAll('SELECT * FROM scam_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]);
    } else {
      reports = await dbAll('SELECT * FROM scam_reports ORDER BY created_at DESC LIMIT 10');
    }

    const formatted = reports.map(r => ({
      ...r,
      flags: JSON.parse(r.flags || '[]')
    }));

    return res.json({
      success: true,
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch saved reports', error: error.message });
  }
};
