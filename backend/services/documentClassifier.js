/**
 * Performs keyword-based document classification and key-value extraction from text.
 * Covers Passport, Aadhaar, PAN, Driving Licence, Income Certificate, and Marksheet.
 * @param {string} text - Raw OCR / digital extracted text
 * @returns {object} - Classification results and parsed fields
 */
function classifyAndExtract(text) {
  const upperText = (text || '').toUpperCase();
  let documentType = 'Unknown document';
  let confidence = 'Low';
  const extractedFields = {};

  // Keyword rules for identification
  const isPan = upperText.includes('INCOME TAX') || upperText.includes('PERMANENT ACCOUNT') || upperText.includes('PAN CARD') || (upperText.includes('GOVT OF INDIA') && upperText.includes('TAX')) || /[A-Z]{5}\d{4}[A-Z]/.test(upperText);
  const isAadhaar = upperText.includes('UNIQUE IDENTIFICATION') || upperText.includes('UIDAI') || upperText.includes('AADHAAR') || upperText.includes('ADHAAR') || (upperText.includes('GOVERNMENT OF INDIA') && (upperText.includes('MERA AADHAAR') || /\b\d{4}\s\d{4}\s\d{4}\b/.test(upperText)));
  const isPassport = upperText.includes('PASSPORT') || upperText.includes('REPUBLIC OF INDIA') || upperText.includes('MINISTRY OF EXTERNAL AFFAIRS') || /[A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9]/.test(upperText);
  const isDL = (upperText.includes('DRIVING') && (upperText.includes('LICENCE') || upperText.includes('LICENSE'))) || upperText.includes('TRANSPORT DEPARTMENT') || upperText.includes('UNION OF INDIA') && upperText.includes('MOTOR');
  const isIncomeCert = upperText.includes('INCOME CERTIFICATE') || upperText.includes('REVENUE DEPARTMENT') || (upperText.includes('TAHSILDAR') && upperText.includes('INCOME'));
  const isMarksheet = upperText.includes('MARKSHEET') || upperText.includes('STATEMENT OF MARKS') || upperText.includes('SECONDARY SCHOOL') || upperText.includes('BOARD OF EDUCATION') || upperText.includes('ROLL NO');

  if (isPassport) {
    documentType = 'Passport';
    confidence = 'High';
  } else if (isPan) {
    documentType = 'PAN Card';
    confidence = 'High';
  } else if (isAadhaar) {
    documentType = 'Aadhaar Document';
    confidence = 'High';
  } else if (isDL) {
    documentType = 'Driving Licence';
    confidence = 'High';
  } else if (isIncomeCert) {
    documentType = 'Income Certificate';
    confidence = 'High';
  } else if (isMarksheet) {
    documentType = 'Academic Marksheet';
    confidence = 'High';
  } else {
    // Secondary regex heuristic
    if (/[A-Z]{5}\d{4}[A-Z]/.test(upperText)) {
      documentType = 'PAN Card';
      confidence = 'Medium';
    } else if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(upperText)) {
      documentType = 'Aadhaar Document';
      confidence = 'Medium';
    }
  }

  // --- Field Extraction ---

  // 1. Passport Number
  const passportMatch = text.match(/\b([A-Za-z][0-9]{7})\b/i);
  if (passportMatch) {
    extractedFields['Passport Number'] = passportMatch[1].toUpperCase();
  }

  // 2. PAN Number
  const panMatch = upperText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  if (panMatch) {
    extractedFields['PAN Number'] = panMatch[1];
  }

  // 3. Aadhaar Number
  const aadhaarMatch = text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
  if (aadhaarMatch) {
    extractedFields['Aadhaar Number'] = aadhaarMatch[1].replace(/\s+/g, ' ');
  }

  // 4. Date of Birth
  const dobMatch = text.match(/\b(0[1-9]|[12][0-9]|3[01])[\/\.-](0[1-9]|1[012])[\/\.-](19\d\d|20\d\d)\b/);
  if (dobMatch) {
    extractedFields['Date of Birth'] = dobMatch[0];
  } else {
    const dobKeywordMatch = text.match(/(?:DOB|Date of Birth|Birth Date)[:\s]*([0-9]{2}[\/\.-][0-9]{2}[\/\.-][0-9]{4})/i);
    if (dobKeywordMatch) {
      extractedFields['Date of Birth'] = dobKeywordMatch[1];
    }
  }

  // 5. Expiry Date (critical for passport & driving licence)
  const expiryMatch = text.match(/(?:Expiry|Valid Till|Date of Expiry|Expiry Date)[:\s]*([0-9]{2}[\/\.-][0-9]{2}[\/\.-][0-9]{4})/i);
  if (expiryMatch) {
    extractedFields['Expiry Date'] = expiryMatch[1];
  }

  // 6. Name Extraction
  const nameMatch = text.match(/(?:Name|Full Name|Given Name\(s\)|Holder Name)[:\s]*([A-Za-z\s]{3,35})/i);
  if (nameMatch) {
    extractedFields['Name'] = nameMatch[1].trim();
  } else {
    // Line-based heuristic: first non-header alphabetical line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    const candidateName = lines.find(l => {
      const u = l.toUpperCase();
      return !u.includes('GOVT') && !u.includes('INDIA') && !u.includes('CARD') && 
             !u.includes('TAX') && !u.includes('DEPARTMENT') && !u.includes('MINISTRY') &&
             !u.includes('PASSPORT') && !u.includes('REPUBLIC') && !/[0-9]/.test(l) &&
             /^[A-Za-z\s]+$/.test(l);
    });
    if (candidateName && candidateName.length <= 35) {
      extractedFields['Name'] = candidateName;
    }
  }

  // 7. Gender
  if (upperText.includes('FEMALE')) {
    extractedFields['Gender'] = 'Female';
  } else if (upperText.includes('MALE')) {
    extractedFields['Gender'] = 'Male';
  }

  // 8. Nationality
  if (upperText.includes('INDIAN') || upperText.includes('IND')) {
    extractedFields['Nationality'] = 'Indian';
  }

  // 9. Income figure (for income certificate)
  const incomeMatch = text.match(/(?:Annual Income|Total Income|Income)[:\s]*(?:Rs\.?|₹)?\s*([0-9,]+)/i);
  if (incomeMatch) {
    extractedFields['Annual Income'] = incomeMatch[1].replace(/,/g, '');
  }

  return {
    documentType,
    confidence,
    rawText: text,
    extractedFields,
    disclaimer: 'Note: OCR extraction and document classification are advisory heuristics and do not constitute legal verification of authenticity.'
  };
}

module.exports = {
  classifyAndExtract
};
