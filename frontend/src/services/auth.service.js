import { apiClient, unwrap } from '../lib/apiClient.js';

export const authService = {
  session: () => apiClient.get('/auth/session').then(unwrap),
  onboard: (body) => apiClient.post('/auth/onboarding', body).then(unwrap),
  logout: () => apiClient.post('/auth/logout').then(unwrap),
};
