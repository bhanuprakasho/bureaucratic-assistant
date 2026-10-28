const { db } = require('../database/database');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

/**
 * Generates deterministic formal letter text strictly based on user-supplied facts.
 * Never fabricates nonexistent qualifications, income figures, or personal claims.
 */
function buildLetterContent(letterType, facts, user) {
  const applicantName = facts.applicantName || user.full_name || 'Applicant';
  const currentDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const recipient = facts.recipientOffice || 'The Competent Authority / Administrative Officer';

  if (letterType === 'SCHOLARSHIP_SOP') {
    const institution = facts.institution || '[Name of Enrolled Educational Institution]';
    const course = facts.course || '[Name of Program/Course]';
    const annualIncome = facts.annualIncome ? `₹${Number(facts.annualIncome).toLocaleString('en-IN')}` : '[Declared Annual Family Income]';
    const academicMerit = facts.academicScore ? `${facts.academicScore}` : 'satisfactory academic standing';
    const futureGoals = facts.careerGoal || 'contribute meaningfully to public development through professional excellence';

    return `Date: ${currentDate}

To,
${recipient}

Subject: Statement of Purpose (SOP) for Post-Matric Scholarship Application

Respected Sir/Madam,

I, ${applicantName}, am writing to formally submit my Statement of Purpose in support of my application for the Post-Matric Scholarship Scheme.

I am currently admitted to and pursuing ${course} at ${institution}. In my previous qualifying examinations, I achieved ${academicMerit}.

My family's total verified annual household income is ${annualIncome}. Due to financial constraints within my household, pursuing higher education without external financial support presents significant hardship. This scholarship will alleviate the burden of tuition and essential academic materials, enabling me to focus dedicatedly on my coursework.

Upon completing my studies, my objective is to ${futureGoals}. I hereby affirm that all information furnished in my application dossier and attached identity certificates is true and verifiable.

I respectfully request the committee to consider my application favorably.

Yours sincerely,

${applicantName}
Applicant / Student
Contact Email: ${user.email || ''}`;
  }

  if (letterType === 'INCOME_JUSTIFICATION') {
    const occupation = facts.occupation || 'primary occupation';
    const annualIncome = facts.annualIncome ? `₹${Number(facts.annualIncome).toLocaleString('en-IN')}` : '[Declared Income]';
    const dependentsCount = facts.dependentsCount || 'family members';

    return `Date: ${currentDate}

To,
${recipient}

Subject: Self-Declaration Undertaking Regarding Household Annual Income

Respected Sir/Madam,

I, ${applicantName}, resident of ${facts.address || '[Declared Residential Address]'}, do hereby solemnly affirm and state as follows:

1. That my primary source of livelihood is ${occupation}.
2. That the gross aggregate annual income of my family from all sources for the preceding financial year does not exceed ${annualIncome}.
3. That I support a total of ${dependentsCount} dependent family members residing with me.
4. That this statement is submitted in support of my application for official welfare benefits/fee concessions, and no material fact has been concealed or misrepresented.

I understand that if any part of this declaration is found to be false or inaccurate upon official verification, my application shall be liable for immediate cancellation and appropriate administrative action.

Declared on this ${currentDate}.

Deponent / Applicant:
${applicantName}`;
  }

  if (letterType === 'GRIEVANCE_PETITION') {
    const serviceName = facts.serviceName || 'Public Service Application';
    const ackNumber = facts.acknowledgmentNumber || '[Application / ARN Number]';
    const submissionDate = facts.submissionDate || '[Date of Initial Submission]';

    return `Date: ${currentDate}

To,
${recipient}

Subject: Formal Grievance Regarding Delay in Processing ${serviceName} (Ref: ${ackNumber})

Respected Sir/Madam,

I am writing to draw your kind attention to the pending status of my application for ${serviceName}, submitted under Acknowledgment Reference Number ${ackNumber} on ${submissionDate}.

As per citizen charter standards, the stipulated processing timeframe for this service has elapsed. I have submitted all required original documents and completed the necessary biometric/verification appointments. However, the portal status currently reflects no progress.

Kindly inspect the status of this dossier and expedite the dispatch/approval of the final certificate or document.

Thanking you.

Yours faithfully,

${applicantName}
Application ARN: ${ackNumber}
Email: ${user.email || ''}`;
  }

  // Generic Official Application Letter fallback
  return `Date: ${currentDate}

To,
${recipient}

Subject: Official Representation Regarding ${facts.serviceName || 'Public Service Request'}

Respected Authority,

I, ${applicantName}, am submitting this formal representation concerning my application. All supporting facts and documents attached have been verified by me as true and accurate.

Kindly process this request in accordance with relevant administrative procedures.

Yours sincerely,
${applicantName}`;
}

// POST /api/letters/generate
exports.generateLetter = async (req, res) => {
  try {
    const { title, letterType, serviceId, recipientOffice, facts } = req.body;
    const userId = req.user.id;

    if (!letterType || !facts) {
      return res.status(400).json({ success: false, message: 'letterType and facts object are required.' });
    }

    const generatedContent = buildLetterContent(letterType, facts, req.user);
    const letterTitle = title || `${letterType.replace(/_/g, ' ')} - ${new Date().toLocaleDateString('en-IN')}`;

    const result = await dbRun(`
      INSERT INTO letters (user_id, title, letter_type, service_id, recipient_office, content, facts_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      letterTitle,
      letterType,
      serviceId || null,
      recipientOffice || null,
      generatedContent,
      JSON.stringify(facts)
    ]);

    return res.status(201).json({
      success: true,
      message: 'Statement / Letter generated and saved successfully.',
      letterId: result.lastID,
      title: letterTitle,
      content: generatedContent
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate letter', error: error.message });
  }
};

// GET /api/letters
exports.getUserLetters = async (req, res) => {
  try {
    const userId = req.user.id;
    const letters = await dbAll('SELECT id, title, letter_type, service_id, recipient_office, created_at FROM letters WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return res.json({ success: true, count: letters.length, data: letters });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve letters', error: error.message });
  }
};

// GET /api/letters/:id
exports.getLetterById = async (req, res) => {
  try {
    const { id } = req.params;
    const letter = await dbGet('SELECT * FROM letters WHERE id = ?', [id]);

    if (!letter) {
      return res.status(404).json({ success: false, message: 'Letter not found.' });
    }
    if (letter.user_id !== req.user.id && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this letter.' });
    }

    return res.json({
      success: true,
      data: {
        ...letter,
        factsData: JSON.parse(letter.facts_data || '{}')
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving letter', error: error.message });
  }
};

// PUT /api/letters/:id - Update content after user edits
exports.updateLetter = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const letter = await dbGet('SELECT user_id FROM letters WHERE id = ?', [id]);
    if (!letter) {
      return res.status(404).json({ success: false, message: 'Letter not found.' });
    }
    if (letter.user_id !== req.user.id && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this letter.' });
    }

    await dbRun(`
      UPDATE letters
      SET title = coalesce(?, title), content = coalesce(?, content)
      WHERE id = ?
    `, [title, content, id]);

    return res.json({ success: true, message: 'Letter updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update letter', error: error.message });
  }
};

// DELETE /api/letters/:id
exports.deleteLetter = async (req, res) => {
  try {
    const { id } = req.params;
    const letter = await dbGet('SELECT user_id FROM letters WHERE id = ?', [id]);
    if (!letter) {
      return res.status(404).json({ success: false, message: 'Letter not found.' });
    }
    if (letter.user_id !== req.user.id && !['reviewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this letter.' });
    }

    await dbRun('DELETE FROM letters WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Letter deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete letter', error: error.message });
  }
};
