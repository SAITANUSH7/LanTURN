import { apiClient, unwrap } from '../lib/apiClient.js';

export const applicationService = {
  apply: (jobId, body) => apiClient.post(`/jobs/${jobId}/apply`, body).then(unwrap),
  listMine: () => apiClient.get('/applications').then(unwrap),
  get: (applicationId) => apiClient.get(`/applications/${applicationId}`).then(unwrap),
  withdraw: (applicationId) => apiClient.post(`/applications/${applicationId}/withdraw`).then(unwrap),
  listForJob: (jobId, params) => apiClient.get(`/employer/jobs/${jobId}/candidates`, { params }).then(unwrap),
  getEmployerApplication: (applicationId) => apiClient.get(`/employer/applications/${applicationId}`).then(unwrap),
  updateStatus: (applicationId, body) => apiClient.patch(`/employer/applications/${applicationId}/status`, body).then(unwrap),
  getResumeFileUrl: (resumeId) => `/api/resumes/${resumeId}/file`,
};
