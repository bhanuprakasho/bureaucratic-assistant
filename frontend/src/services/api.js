import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach Authorization Bearer token to all outgoing requests if token exists
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && token !== 'demo-token') {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Handle 401 Unauthorized responses
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized on a protected route, token is stale or invalid
      // Only clear if on an authenticated action
      const url = error.config?.url || '';
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        // Token expired or invalid
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth APIs ---
export const loginUser = async (credentials) => (await API.post('/auth/login', credentials)).data;
export const registerUser = async (userData) => (await API.post('/auth/register', userData)).data;
export const getMyProfile = async () => (await API.get('/auth/me')).data;
export const logoutUser = async () => (await API.post('/auth/logout')).data;

// --- Services API ---
export const fetchAllServices = async () => (await API.get('/services')).data;
export const fetchServiceById = async (id) => (await API.get(`/services/${id}`)).data;

// --- Document Upload & Management API ---
export const uploadDocument = async (file, isSynthetic = false) => {
  const formData = new FormData();
  formData.append('document', file);
  formData.append('is_synthetic', isSynthetic);

  const response = await API.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const fetchUserDocuments = async (all = false) => (await API.get(`/documents${all ? '?all=true' : ''}`)).data;
export const fetchDocumentById = async (id) => (await API.get(`/documents/${id}`)).data;
export const confirmDocumentFields = async (id, payload) => (await API.post(`/documents/${id}/confirm`, payload)).data;
export const deleteDocument = async (id) => (await API.delete(`/documents/${id}`)).data;
export const getDocumentFileUrl = (id) => `/api/documents/${id}/file`;

// --- Eligibility Checker API ---
export const fetchEligibilitySchemes = async () => (await API.get('/eligibility/schemes')).data;
export const checkEligibility = async (formData) => (await API.post('/eligibility/check', formData)).data;

// --- Scam Verification API ---
export const analyzeScamMessage = async (message) => (await API.post('/scam/analyze', { message })).data;
export const fetchSavedScamReports = async () => (await API.get('/scam/reports')).data;

// --- Immigration & Screening Cases API ---
export const createImmigrationCase = async (caseData) => (await API.post('/immigration/cases', caseData)).data;
export const fetchImmigrationCases = async () => (await API.get('/immigration/cases')).data;
export const fetchImmigrationCaseById = async (id) => (await API.get(`/immigration/cases/${id}`)).data;
export const linkDocumentToCase = async (caseId, payload) => (await API.post(`/immigration/cases/${caseId}/documents`, payload)).data;
export const updateCaseFlag = async (caseId, flagId, payload) => (await API.patch(`/immigration/cases/${caseId}/flags/${flagId}`, payload)).data;
export const recordCaseDecision = async (caseId, payload) => (await API.post(`/immigration/cases/${caseId}/decision`, payload)).data;

// --- Knowledge Base & RAG APIs ---
export const fetchArticles = async (params = {}) => (await API.get('/knowledge/articles', { params })).data;
export const fetchArticleBySlug = async (slug) => (await API.get(`/knowledge/articles/${slug}`)).data;
export const searchKnowledge = async (query) => (await API.post('/knowledge/search', { query })).data;
export const askAssistant = async (question) => (await API.post('/knowledge/assistant', { question })).data;
export const createArticle = async (payload) => (await API.post('/knowledge/articles', payload)).data;
export const deleteArticle = async (id) => (await API.delete(`/knowledge/articles/${id}`)).data;

// --- Interactive Checklists API ---
export const fetchChecklistByService = async (serviceId) => (await API.get(`/checklists/${serviceId}`)).data;
export const saveChecklist = async (serviceId, payload) => (await API.post(`/checklists/${serviceId}`, payload)).data;
export const fetchAllUserChecklists = async () => (await API.get('/checklists')).data;

// --- Application Drafts API ---
export const fetchUserDrafts = async () => (await API.get('/drafts')).data;
export const fetchDraftById = async (id) => (await API.get(`/drafts/${id}`)).data;
export const saveDraft = async (payload) => (await API.post('/drafts', payload)).data;
export const deleteDraft = async (id) => (await API.delete(`/drafts/${id}`)).data;

// --- Formal Statements & Letters API ---
export const generateLetter = async (payload) => (await API.post('/letters/generate', payload)).data;
export const fetchUserLetters = async () => (await API.get('/letters')).data;
export const fetchLetterById = async (id) => (await API.get(`/letters/${id}`)).data;
export const updateLetter = async (id, payload) => (await API.put(`/letters/${id}`, payload)).data;
export const deleteLetter = async (id) => (await API.delete(`/letters/${id}`)).data;

// --- Reminders & Notifications API ---
export const fetchReminders = async () => (await API.get('/reminders')).data;
export const createReminder = async (payload) => (await API.post('/reminders', payload)).data;
export const updateReminder = async (id, payload) => (await API.patch(`/reminders/${id}`, payload)).data;
export const deleteReminder = async (id) => (await API.delete(`/reminders/${id}`)).data;

export default API;
