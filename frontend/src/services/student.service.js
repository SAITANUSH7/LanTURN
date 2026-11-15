import { apiClient, unwrap } from '../lib/apiClient.js';

export const studentService = {
  getProfile: () => apiClient.get('/students/me/profile').then(unwrap),
  getPublic: (studentId) => apiClient.get(`/students/${studentId}/public`).then(unwrap),
  updateProfile: (body) => apiClient.put('/students/me/profile', body).then(unwrap),
  getSkills: () => apiClient.get('/students/me/skills').then(unwrap),
  updateSkills: (skillIds) => apiClient.put('/students/me/skills', { skillIds }).then(unwrap),
  listSkills: (q) => apiClient.get('/skills', { params: q ? { q } : undefined }).then(unwrap),
  listRoles: () => apiClient.get('/roles').then(unwrap),
  getRole: (id) => apiClient.get(`/roles/${id}`).then(unwrap),
  getResumes: () => apiClient.get('/resumes').then(unwrap),
  getResume: (id) => apiClient.get(`/resumes/${id}`).then(unwrap),
  uploadResume: (formData) =>
    apiClient.post('/resumes', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(unwrap),
  deleteResume: (id) => apiClient.delete(`/resumes/${id}`).then(unwrap),
  analyzeResume: (id) => apiClient.post(`/resumes/${id}/analyze`).then(unwrap),
  tailorResume: (id, body) => apiClient.post(`/resumes/${id}/tailor`, body).then(unwrap),
  getResumeUrl: (id) => `/api/resumes/${id}/file`,
};
