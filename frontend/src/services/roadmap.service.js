import { apiClient, unwrap } from '../lib/apiClient.js';

export const roadmapService = {
  /** List all available career domains */
  listDomains: () => apiClient.get('/roadmaps/domains').then(unwrap),

  /** Get full domain detail (static data from backend) */
  getDomain: (domainId) => apiClient.get(`/roadmaps/domains/${domainId}`).then(unwrap),

  /** Get the student's enrolled roadmaps with progress */
  getMyRoadmaps: () => apiClient.get('/roadmaps/me').then(unwrap),

  /** Enroll in a career domain */
  enroll: (domainId) => apiClient.post('/roadmaps/me/enroll', { domainId }).then(unwrap),

  /** Remove a roadmap enrollment */
  remove: (roadmapId) => apiClient.delete(`/roadmaps/me/${roadmapId}`).then(unwrap),

  /** Toggle a topic's completion */
  toggleTopic: (roadmapId, stageIndex, topicIndex, completed) =>
    apiClient
      .patch(`/roadmaps/me/${roadmapId}/progress`, { stageIndex, topicIndex, completed })
      .then(unwrap),

  /** AI Resume Gap Analyzer — upload PDF + domainId */
  analyzeResume: (formData) =>
    apiClient
      .post('/roadmaps/analyze-resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // PDF parsing + AI can take time
      })
      .then(unwrap),

  /** Batch-sync matched resume topics to roadmap progress */
  syncResumeProgress: (roadmapId, topicKeys) =>
    apiClient.post('/roadmaps/sync-resume-progress', { roadmapId, topicKeys }).then(unwrap),
};

