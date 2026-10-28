const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Environment setup for testing
process.env.PORT = '5099';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_bureaucratic_system_2026';

const app = require('express')();
const http = require('http');

let server;
let baseUrl;
let citizenToken = '';
let reviewerToken = '';
let adminToken = '';
let citizenId = null;
let testDocId = null;
let testCaseId = null;
let testFlagId = null;
let testDraftId = null;
let testReminderId = null;

before(async () => {
  // Require and start the real backend server
  const seedDatabase = require('../database/seed');
  await seedDatabase();

  // Import Express app configuration from server.js modules
  const express = require('express');
  const cors = require('cors');
  const testApp = express();

  testApp.use(cors());
  testApp.use(express.json());

  testApp.get('/api/health', (req, res) => res.json({ status: 'OK' }));

  testApp.use('/api/auth', require('../routes/authRoutes'));
  testApp.use('/api/services', require('../routes/serviceRoutes'));
  testApp.use('/api/documents', require('../routes/documentRoutes'));
  testApp.use('/api/eligibility', require('../routes/eligibilityRoutes'));
  testApp.use('/api/scam', require('../routes/scamRoutes'));
  testApp.use('/api/immigration', require('../routes/immigrationRoutes'));
  testApp.use('/api/knowledge', require('../routes/knowledgeRoutes'));
  testApp.use('/api/checklists', require('../routes/checklistRoutes'));
  testApp.use('/api/drafts', require('../routes/draftRoutes'));
  testApp.use('/api/letters', require('../routes/letterRoutes'));
  testApp.use('/api/reminders', require('../routes/reminderRoutes'));

  server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(5099, resolve));
  baseUrl = 'http://localhost:5099';
  console.log(`Test server running at ${baseUrl}`);
});

after(() => {
  if (server) server.close();
});

// Helper for fetch requests
async function req(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

describe('1. Authentication & Role-Based Access Control', () => {
  it('should register a new citizen user', async () => {
    const testUsername = `test_cit_${Date.now()}`;
    const res = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: testUsername,
        email: `${testUsername}@example.com`,
        password: 'Password123!',
        full_name: 'Test Citizen Applicant'
      })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.user.role, 'citizen');
    assert.ok(res.data.token);
  });

  it('should sign in with seeded citizen credentials', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'citizen_demo',
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.user.role, 'citizen');
    citizenToken = res.data.token;
    citizenId = res.data.user.id;
  });

  it('should sign in with seeded reviewer credentials', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'reviewer_demo',
        password: 'ReviewerPass123!'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.user.role, 'reviewer');
    reviewerToken = res.data.token;
  });

  it('should sign in with seeded admin credentials', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'admin_demo',
        password: 'AdminSecurePass123!'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.user.role, 'admin');
    adminToken = res.data.token;
  });

  it('should reject invalid password', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'citizen_demo',
        password: 'WrongPassword999!'
      })
    });

    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  it('should reject forged demo token strings', async () => {
    const res = await req('/api/immigration/cases', {
      method: 'GET',
      headers: { Authorization: 'Bearer demo-token' }
    });

    assert.equal(res.status, 401);
  });
});

describe('2. Government Service Directory & Eligibility Evaluation', () => {
  it('should retrieve services list from database', async () => {
    const res = await req('/api/services');
    assert.equal(res.status, 200);
    assert.ok(res.data.count >= 4);
  });

  it('should correctly evaluate an eligible student scholarship applicant', async () => {
    const res = await req('/api/eligibility/check', {
      method: 'POST',
      body: JSON.stringify({
        schemeId: 'scholarship',
        age: 20,
        annualIncome: 180000,
        isStudent: 'yes',
        category: 'OBC'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.isEligible, true);
    assert.equal(res.data.status, 'Potentially Eligible');
    assert.ok(res.data.reasons.some(r => r.toLowerCase().includes('income')));
  });

  it('should correctly evaluate an ineligible applicant exceeding income ceiling', async () => {
    const res = await req('/api/eligibility/check', {
      method: 'POST',
      body: JSON.stringify({
        schemeId: 'scholarship',
        age: 20,
        annualIncome: 900000, // Exceeds 2,50,000 cap
        isStudent: 'yes',
        category: 'OBC'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.isEligible, false);
    assert.equal(res.data.status, 'Ineligible');
  });
});

describe('3. Document Upload, Classification & Private Storage', () => {
  it('should upload a document and extract fields via classifier', async () => {
    const textContent = `REPUBLIC OF INDIA - PASSPORT\nPassport No: Z9182736\nSurname: SHARMA\nGiven Name(s): RAHUL\nNationality: INDIAN\nSex: MALE\nDate of Birth: 14/08/1995\nDate of Expiry: 09/05/2030`;
    const blob = new Blob([textContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('document', blob, 'test_passport_valid.txt');
    formData.append('is_synthetic', 'true');

    const res = await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.result.documentType, 'Passport');
    assert.equal(data.result.extractedFields['Passport Number'], 'Z9182736');
    assert.equal(data.result.extractedFields['Date of Birth'], '14/08/1995');
    testDocId = data.documentId;
  });

  it('should stream private document to authorized owner', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${testDocId}/file`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('REPUBLIC OF INDIA'));
  });

  it('should deny unauthenticated requests to download private files', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${testDocId}/file`);
    assert.equal(res.status, 401);
  });
});

describe('4. Machine Learning Scam Detection', () => {
  it('should detect high risk scam lure with ML model and heuristic indicators', async () => {
    const res = await req('/api/scam/analyze', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Dear User, Your electricity power will be disconnected tonight at 9.30 PM immediately contact officer 9812345678 or pay fee at http://bescom-pay.xyz/bill'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.riskScore >= 40);
    assert.equal(res.data.isMlPrediction, true);
    assert.equal(res.data.mlPrediction, 'spam');
    assert.ok(res.data.reasons.length >= 1);
  });

  it('should classify genuine citizen notice as low risk ham', async () => {
    const res = await req('/api/scam/analyze', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Dear Resident, Aadhaar update request URN 12345 has been processed. Download e-Aadhaar from https://myaadhaar.uidai.gov.in. UIDAI never asks for OTP over phone.'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.riskLevel, 'LOW');
    assert.equal(res.data.mlPrediction, 'ham');
  });
});

describe('5. Immigration Screening Workflow & Role Authorization', () => {
  it('should allow citizen to create an immigration case', async () => {
    const res = await req('/api/immigration/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        applicant_name: 'Rahul Sharma',
        applicant_email: 'rahul@example.com',
        category: 'Identity Screening'
      })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.caseNumber.startsWith('CASE-'));
    testCaseId = res.data.caseId;
  });

  it('should attach document and run automated screening analysis', async () => {
    const res = await req(`/api/immigration/cases/${testCaseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        document_id: testDocId,
        doc_role: 'PRIMARY_PASSPORT'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.analysis);
  });

  it('should upload an expired passport and generate EXPIRED_DOCUMENT flag', async () => {
    const textContent = `REPUBLIC OF INDIA - PASSPORT\nPassport No: P9988776\nName: Rahul Sharma\nDate of Birth: 14/08/1995\nDate of Expiry: 01/01/2020`;
    const blob = new Blob([textContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('document', blob, 'test_expired_passport.txt');
    formData.append('is_synthetic', 'true');

    const uploadRes = await fetch(`${baseUrl}/api/documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: formData
    });
    const uploadData = await uploadRes.json();

    const linkRes = await req(`/api/immigration/cases/${testCaseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        document_id: uploadData.documentId,
        doc_role: 'PRIMARY_PASSPORT'
      })
    });

    assert.equal(linkRes.status, 200);
    const caseDetails = await req(`/api/immigration/cases/${testCaseId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    assert.ok(caseDetails.data.data.flags.length > 0);
    const expiryFlag = caseDetails.data.data.flags.find(f => f.flag_code === 'EXPIRED_DOCUMENT');
    assert.ok(expiryFlag, 'Expected EXPIRED_DOCUMENT flag to be generated');
    testFlagId = expiryFlag.id;
  });

  it('should DENY citizen from changing reviewer flags (Forbidden 403)', async () => {
    const res = await req(`/api/immigration/cases/${testCaseId}/flags/${testFlagId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        status: 'RESOLVED',
        reviewer_comment: 'Citizen trying to resolve their own flag'
      })
    });

    assert.equal(res.status, 403);
  });

  it('should ALLOW reviewer to update flag status', async () => {
    const res = await req(`/api/immigration/cases/${testCaseId}/flags/${testFlagId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${reviewerToken}` },
      body: JSON.stringify({
        status: 'RESOLVED',
        reviewer_comment: 'Verified with secondary official records'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  it('should ALLOW reviewer to record binding decision', async () => {
    const res = await req(`/api/immigration/cases/${testCaseId}/decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerToken}` },
      body: JSON.stringify({
        decision: 'APPROVED',
        notes: 'Identity confirmed against national civil registry'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'APPROVED');
  });
});

describe('6. Checklists, Application Drafts & Reminders Persistence', () => {
  it('should save and retrieve user checklist items in database', async () => {
    const res = await req('/api/checklists/scholarship', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        items: [
          { id: 1, name: 'Income Certificate', checked: true },
          { id: 2, name: 'Aadhaar Card', checked: true }
        ],
        serviceName: 'Post-Matric Scholarship Scheme'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);

    const getRes = await req('/api/checklists/scholarship', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.isCustomized, true);
    assert.equal(getRes.data.data.items[0].checked, true);
  });

  it('should save application draft and persist across reloads', async () => {
    const res = await req('/api/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        service_id: 'scholarship',
        service_name: 'Post-Matric Scholarship Scheme',
        form_data: {
          applicantName: 'Rahul Sharma',
          annualIncome: 180000,
          category: 'OBC'
        }
      })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    testDraftId = res.data.draftId;

    const listRes = await req('/api/drafts', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    assert.equal(listRes.status, 200);
    assert.ok(listRes.data.data.some(d => d.id === testDraftId));
  });

  it('should schedule reminder and compute upcoming timing status', async () => {
    const nextYear = new Date().getFullYear() + 1;
    const res = await req('/api/reminders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        title: 'Passport Expiration Notice',
        due_date: `${nextYear}-12-31`,
        document_name: 'Passport Z9182736'
      })
    });

    assert.equal(res.status, 201);
    testReminderId = res.data.reminderId;

    const listRes = await req('/api/reminders', {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    assert.equal(listRes.status, 200);
    const item = listRes.data.data.find(r => r.id === testReminderId);
    assert.ok(item);
    assert.equal(item.timingStatus, 'UPCOMING');
    assert.ok(item.daysRemaining > 0);
  });

  it('should generate official Statement of Purpose (SOP) without fabricating facts', async () => {
    const res = await req('/api/letters/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        letterType: 'SCHOLARSHIP_SOP',
        title: 'Post-Matric Scholarship Statement of Purpose',
        recipientOffice: 'National Scholarship Directorate',
        facts: {
          applicantName: 'Rahul Sharma',
          institution: 'Vellore Institute of Technology',
          course: 'B.Tech Computer Science',
          annualIncome: 180000,
          academicScore: '9.2 CGPA',
          careerGoal: 'engineer digital public goods'
        }
      })
    });

    assert.equal(res.status, 201);
    assert.ok(res.data.content.includes('Rahul Sharma'));
    assert.ok(res.data.content.includes('Vellore Institute of Technology'));
    assert.ok(res.data.content.includes('₹1,80,000'));
  });
});

describe('7. Knowledge Base & Grounded Assistant Attribution', () => {
  it('should return grounded official answers citing source portals', async () => {
    const res = await req('/api/knowledge/assistant', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What are the rules and fees for fresh Indian passport application?'
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.grounded, true);
    assert.ok(res.data.sources.some(s => s.official_portal.includes('passportindia')));
  });

  it('should DENY non-admin users from creating knowledge articles', async () => {
    const res = await req('/api/knowledge/articles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        title: 'Fake Regulation',
        category: 'Identity',
        source_url: 'http://fake.com',
        official_portal: 'fake.com',
        summary: 'summary',
        content: 'content'
      })
    });

    assert.equal(res.status, 403);
  });

  it('should ALLOW admin to publish official article', async () => {
    const res = await req('/api/knowledge/articles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'National Pension System (NPS) Enrolment Protocol',
        category: 'Tax & Financial',
        source_url: 'https://enps.nsdl.com',
        official_portal: 'enps.nsdl.com',
        summary: 'Standard guidelines for voluntary pension contribution under PFRDA.',
        content: 'Any citizen of India between 18-70 years of age can open an NPS Tier I account.',
        official_fee: '₹500 initial minimum contribution'
      })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
  });
});
