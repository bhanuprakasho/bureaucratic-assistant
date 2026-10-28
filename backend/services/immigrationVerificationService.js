/**
 * Immigration & Identity Screening Verification Engine
 * Analyzes structured fields across paired identity documents (e.g. Passport, Aadhaar, Driving Licence).
 * Evaluates date logic, cross-document discrepancies, expiry status, and missing critical fields.
 */

// Helper to calculate Levenshtein distance or normalized token overlap
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  const clean1 = name1.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const clean2 = name2.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  if (clean1 === clean2) return 1.0;

  const words1 = clean1.split(/\s+/);
  const words2 = clean2.split(/\s+/);

  const intersection = words1.filter(w => words2.includes(w));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.length / union.size : 0;
}

// Parses string date in DD/MM/YYYY or YYYY-MM-DD
function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();

  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = clean.split(/[\/\.-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD/MM/YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    } else if (parts[0].length === 4) {
      // YYYY/MM/DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  return null;
}

/**
 * Runs cross-document consistency checks and returns discovered flags and report summary
 * @param {Array} caseDocuments - Array of document records with parsed extractedFields
 */
function runScreeningAnalysis(caseDocuments) {
  const flags = [];
  const findings = [];
  const now = new Date();

  if (!caseDocuments || caseDocuments.length === 0) {
    return {
      riskLevel: 'HIGH',
      flags: [{
        flag_code: 'NO_DOCUMENTS_ATTACHED',
        severity: 'HIGH',
        title: 'No Documents Attached',
        description: 'Case has been initiated without supporting identity documentation.',
        evidence: JSON.stringify({ documentCount: 0 })
      }],
      summary: 'Insufficient documentation for verification screening.'
    };
  }

  // 1. Inspect each individual document for internal validity (expiry, unreadable critical fields)
  for (const doc of caseDocuments) {
    const fields = doc.extractedFields || {};
    const docName = doc.original_name || `Doc #${doc.id}`;
    const docType = doc.document_type || 'Unknown';

    // Expiry Date Check
    if (fields['Expiry Date']) {
      const parsedExpiry = parseDateString(fields['Expiry Date']);
      if (parsedExpiry) {
        if (parsedExpiry < now) {
          flags.push({
            flag_code: 'EXPIRED_DOCUMENT',
            severity: 'CRITICAL',
            title: `Expired Document Detected: ${docType}`,
            description: `The document '${docName}' shows an expiry date of ${fields['Expiry Date']}, which is in the past.`,
            evidence: JSON.stringify({ documentId: doc.id, documentName: docName, expiryDate: fields['Expiry Date'] })
          });
        } else {
          findings.push(`✓ ${docType} is valid until ${fields['Expiry Date']}.`);
        }
      }
    }

    // Critical identification number check
    if (docType === 'Passport' && !fields['Passport Number']) {
      flags.push({
        flag_code: 'MISSING_PASSPORT_NUMBER',
        severity: 'HIGH',
        title: 'Missing or Unreadable Passport Number',
        description: `Passport document '${docName}' does not display a clear standard passport number.`,
        evidence: JSON.stringify({ documentId: doc.id })
      });
    }

    if (docType === 'PAN Card' && !fields['PAN Number']) {
      flags.push({
        flag_code: 'MISSING_PAN_NUMBER',
        severity: 'MEDIUM',
        title: 'Missing or Unreadable PAN Number',
        description: `PAN Card '${docName}' does not show a valid 10-digit alphanumeric PAN format.`,
        evidence: JSON.stringify({ documentId: doc.id })
      });
    }

    // Synthetic Flag Check
    if (doc.is_synthetic) {
      findings.push(`[Notice: Document '${docName}' is tagged as synthetic test fixture]`);
    }
  }

  // 2. Cross-Document Comparisons (if at least 2 documents exist)
  if (caseDocuments.length >= 2) {
    const primaryDoc = caseDocuments[0];
    const secondaryDoc = caseDocuments[1];

    const fields1 = primaryDoc.extractedFields || {};
    const fields2 = secondaryDoc.extractedFields || {};

    // A. Cross-Document Name Comparison
    const name1 = fields1['Name'];
    const name2 = fields2['Name'];

    if (name1 && name2) {
      const similarity = calculateNameSimilarity(name1, name2);
      if (similarity < 0.5) {
        flags.push({
          flag_code: 'NAME_MISMATCH',
          severity: 'HIGH',
          title: 'Cross-Document Name Discrepancy',
          description: `Applicant name differs significantly between '${primaryDoc.original_name}' ("${name1}") and '${secondaryDoc.original_name}' ("${name2}"). Similarity index: ${(similarity * 100).toFixed(0)}%.`,
          evidence: JSON.stringify({
            doc1: { id: primaryDoc.id, name: primaryDoc.original_name, extractedName: name1 },
            doc2: { id: secondaryDoc.id, name: secondaryDoc.original_name, extractedName: name2 },
            similarityScore: similarity
          })
        });
      } else if (similarity < 1.0) {
        findings.push(`✓ Name match with minor spelling or order variance: "${name1}" vs "${name2}".`);
      } else {
        findings.push(`✓ Exact applicant name match verified across submitted documents: "${name1}".`);
      }
    } else {
      flags.push({
        flag_code: 'NAME_EXTRACTION_UNCERTAIN',
        severity: 'MEDIUM',
        title: 'Name Not Confidently Extracted',
        description: 'Unable to extract full name from one or more documents to perform cross-document consistency check.',
        evidence: JSON.stringify({ nameDoc1: name1 || null, nameDoc2: name2 || null })
      });
    }

    // B. Cross-Document Date of Birth Comparison
    const dob1 = fields1['Date of Birth'];
    const dob2 = fields2['Date of Birth'];

    if (dob1 && dob2) {
      const pDob1 = parseDateString(dob1);
      const pDob2 = parseDateString(dob2);

      if (pDob1 && pDob2 && pDob1.getTime() !== pDob2.getTime()) {
        flags.push({
          flag_code: 'DOB_MISMATCH',
          severity: 'CRITICAL',
          title: 'Cross-Document Date of Birth Mismatch',
          description: `Date of birth on '${primaryDoc.original_name}' (${dob1}) contradicts date of birth on '${secondaryDoc.original_name}' (${dob2}).`,
          evidence: JSON.stringify({
            doc1: { id: primaryDoc.id, dob: dob1 },
            doc2: { id: secondaryDoc.id, dob: dob2 }
          })
        });
      } else if (dob1.replace(/[^0-9]/g, '') !== dob2.replace(/[^0-9]/g, '')) {
        flags.push({
          flag_code: 'DOB_FORMAT_VARIANCE',
          severity: 'MEDIUM',
          title: 'Date of Birth Inconsistency',
          description: `DOB values appear inconsistent: '${dob1}' vs '${dob2}'.`,
          evidence: JSON.stringify({ dob1, dob2 })
        });
      } else {
        findings.push(`✓ Date of birth consistently verified across submitted documents: ${dob1}.`);
      }
    }
  }

  // Determine overall preliminary risk assessment
  let overallRisk = 'LOW';
  if (flags.some(f => f.severity === 'CRITICAL')) {
    overallRisk = 'HIGH';
  } else if (flags.some(f => f.severity === 'HIGH')) {
    overallRisk = 'HIGH';
  } else if (flags.length > 0) {
    overallRisk = 'MEDIUM';
  }

  return {
    overallRisk,
    flags,
    findings,
    documentsScreened: caseDocuments.length,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  calculateNameSimilarity,
  parseDateString,
  runScreeningAnalysis
};
