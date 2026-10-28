const { db } = require('../database/database');

// GET /api/eligibility/schemes - Get list of schemes available for eligibility check
exports.getEligibilitySchemes = (req, res) => {
  db.all('SELECT id, scheme_id, scheme_name FROM eligibility_rules', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json({ success: true, schemes: rows });
  });
};

// POST /api/eligibility/check - Check eligibility against selected scheme
exports.checkEligibility = (req, res) => {
  const {
    age,
    annualIncome,
    isStudent,
    employmentStatus,
    category,
    state,
    schemeId
  } = req.body;

  if (!schemeId) {
    return res.status(400).json({ success: false, message: 'Please select a scheme to check eligibility.' });
  }

  db.get('SELECT * FROM eligibility_rules WHERE scheme_id = ?', [schemeId], (err, rule) => {
    if (err) {
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!rule) {
      return res.status(404).json({ success: false, message: 'Specified scheme rule not found.' });
    }

    const numericAge = parseInt(age, 10) || 0;
    const numericIncome = parseFloat(annualIncome) || 0;
    const studentFlag = isStudent === true || isStudent === 'yes' || isStudent === 'Yes';

    const reasons = [];
    let isEligible = true;

    // Rule 1: Age
    if (numericAge >= rule.min_age && numericAge <= rule.max_age) {
      reasons.push(`✓ Age (${numericAge}) falls within the required range of ${rule.min_age} to ${rule.max_age} years.`);
    } else {
      isEligible = false;
      reasons.push(`✗ Age (${numericAge}) does not satisfy required range (${rule.min_age}-${rule.max_age} years).`);
    }

    // Rule 2: Income
    if (rule.max_income && numericIncome > rule.max_income) {
      isEligible = false;
      reasons.push(`✗ Annual income (₹${numericIncome.toLocaleString('en-IN')}) exceeds the ceiling of ₹${rule.max_income.toLocaleString('en-IN')}.`);
    } else {
      reasons.push(`✓ Annual income (₹${numericIncome.toLocaleString('en-IN')}) is within eligible limit (Max ₹${rule.max_income ? '₹' + rule.max_income.toLocaleString('en-IN') : 'No limit'}).`);
    }

    // Rule 3: Student Status
    if (rule.must_be_student === 1) {
      if (studentFlag) {
        reasons.push(`✓ Student status condition satisfied.`);
      } else {
        isEligible = false;
        reasons.push(`✗ This scheme is specifically reserved for currently enrolled students.`);
      }
    }

    // Rule 4: Category check
    const allowedCategories = JSON.parse(rule.allowed_categories || '[]');
    if (allowedCategories.length > 0 && !allowedCategories.includes('All')) {
      if (category && allowedCategories.includes(category)) {
        reasons.push(`✓ Category (${category}) is listed in eligible categories.`);
      } else if (category) {
        isEligible = false;
        reasons.push(`✗ Category (${category}) does not match scheme criteria (${allowedCategories.join(', ')}).`);
      }
    }

    const requiredDocs = JSON.parse(rule.required_docs || '[]');

    return res.json({
      success: true,
      schemeName: rule.scheme_name,
      status: isEligible ? 'Potentially Eligible' : 'Ineligible',
      isEligible,
      reasons,
      requiredDocuments: requiredDocs,
      disclaimer: 'Preliminary eligibility result — verify with the official authority.'
    });
  });
};
