import { apiClient, unwrap } from '../lib/apiClient.js';

export const employerService = {
  getCompany: () => apiClient.get('/employers/me/company').then(unwrap),
  getMe: () => apiClient.get('/employers/me/company').then(unwrap),
  updateCompany: (body) => apiClient.put('/employers/me/company', body).then(unwrap),
  updateMe: (body) => apiClient.put('/employers/me/company', body).then(unwrap),
  getDashboard: () => apiClient.get('/employer/dashboard').then(unwrap),
  getAnalytics: () => apiClient.get('/employer/dashboard').then(unwrap),
  getJobCandidates: (jobId, params) => apiClient.get(`/employer/jobs/${jobId}/candidates`, { params }).then(unwrap),
  getRecommendations: (jobId) => apiClient.get(`/employer/jobs/${jobId}/recommendations`).then(unwrap),
  getJobMatches: (jobId) => apiClient.get(`/employer/jobs/${jobId}/recommendations`).then(unwrap).then(r => r.recommendations || []),

  // AI Hiring Assistant
  aiChat: (body) => apiClient.post('/chat/messages', body).then(unwrap),
  aiListThreads: () => apiClient.get('/chat/threads').then(unwrap),
  aiGetMessages: (threadId) => apiClient.get(`/chat/threads/${threadId}`).then(unwrap),
  aiDeleteThread: (threadId) => apiClient.delete(`/chat/threads/${threadId}`).then(unwrap),

  // AI Job Description Generator
  aiGenerateJobDesc: (body) => apiClient.post('/employer/ai/job-description', body).then(unwrap),

  // Company DNA
  generateCompanyDna: () => apiClient.post('/employer/ai/company-dna').then(unwrap),
  getCompanyDna: () => apiClient.get('/employer/ai/company-dna').then(unwrap),
};
