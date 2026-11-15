import { apiClient, unwrap } from '../lib/apiClient.js';

export const networkingService = {
  // Connections
  getConnections: () => apiClient.get('/networking/connections').then(unwrap),
  connect: (userId) => apiClient.post(`/networking/connect/${userId}`).then(unwrap),
  acceptRequest: (id) => apiClient.post(`/networking/requests/${id}/accept`).then(unwrap),
  rejectRequest: (id) => apiClient.post(`/networking/requests/${id}/reject`).then(unwrap),
  removeConnection: (id) => apiClient.delete(`/networking/connections/${id}`).then(unwrap),

  // Community Feed & Posts
  getFeed: (params) => apiClient.get('/networking/feed', { params }).then(unwrap),
  createPost: (body) => apiClient.post('/networking/posts', body).then(unwrap),
  likePost: (postId) => apiClient.post(`/networking/posts/${postId}/like`).then(unwrap),
  getComments: (postId) => apiClient.get(`/networking/posts/${postId}/comments`).then(unwrap),
  addComment: (postId, content) => apiClient.post(`/networking/posts/${postId}/comments`, { content }).then(unwrap),

  // Direct Messaging
  getConversations: () => apiClient.get('/messages/conversations').then(unwrap),
  getMessages: (userId) => apiClient.get(`/messages/${userId}`).then(unwrap),
  sendMessage: (userId, content) => apiClient.post(`/messages/${userId}`, { content }).then(unwrap),

  // Endorsements
  endorseSkill: (studentId, skillId) => apiClient.post('/networking/endorse', { studentId, skillId }).then(unwrap),
  getEndorsements: (studentId) => apiClient.get(`/networking/endorsements/${studentId}`).then(unwrap),
};
