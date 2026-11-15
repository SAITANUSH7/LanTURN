import { apiClient, unwrap } from '../lib/apiClient.js';

export const jobService = {
  list: (params) => apiClient.get('/jobs', { params }).then(unwrap),
  listRecommended: () => apiClient.get('/jobs/recommended').then(unwrap),
  get: (jobId) => apiClient.get(`/jobs/${jobId}`).then(unwrap),
  create: (body) => apiClient.post('/employer/jobs', body).then(unwrap),
  update: (jobId, body) => apiClient.put(`/employer/jobs/${jobId}`, body).then(unwrap),
  close: (jobId) => apiClient.post(`/employer/jobs/${jobId}/close`).then(unwrap),
  remove: (jobId) => apiClient.post(`/employer/jobs/${jobId}/close`).then(unwrap),
  listMine: () => apiClient.get('/employer/jobs').then(unwrap),
  apply: (jobId, body) => apiClient.post(`/jobs/${jobId}/apply`, body).then(unwrap),
  saveJob: (jobId) => apiClient.post(`/jobs/${jobId}/save`).then(unwrap),
  unsaveJob: (jobId) => apiClient.delete(`/jobs/${jobId}/save`).then(unwrap),
  listSaved: () => apiClient.get('/jobs/saved').then(unwrap),
};

export const drivesService = {
  list: () => apiClient.get('/drives').then(unwrap),
  create: (body) => apiClient.post('/drives', body).then(unwrap),
  get: (id) => apiClient.get(`/drives/${id}`).then(unwrap),
  register: (id) => apiClient.post(`/drives/${id}/register`).then(unwrap),
  cancelRegistration: (id) => apiClient.delete(`/drives/${id}/register`).then(unwrap),
  listMyRegistrations: () => apiClient.get('/drives/my/registrations').then(unwrap),
};

export const joobleService = {
  search: (body) => apiClient.post('/jobs/external-search', body).then(unwrap),
};
