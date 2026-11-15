import { apiClient, unwrap } from '../lib/apiClient.js';

export const notificationService = {
  list: (params) => apiClient.get('/notifications', { params }).then(unwrap),
  markRead: (notificationId) => apiClient.patch(`/notifications/${notificationId}/read`).then(unwrap),
  markAllRead: () => apiClient.post('/notifications/read-all').then(unwrap),
};
