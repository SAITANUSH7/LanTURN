import { apiClient, unwrap } from '../lib/apiClient.js';

export const aiService = {
  // Skill Gap & Roadmap
  skillGap: (body) => apiClient.post('/career/skill-gap', body).then(unwrap),
  createRoadmap: (body) => apiClient.post('/career/roadmaps', body).then(unwrap),
  getLatestRoadmap: () => apiClient.get('/career/roadmaps/latest').then(unwrap),
  getRoadmap: (id) => apiClient.get(`/career/roadmaps/${id}`).then(unwrap),

  // Job AI tools
  coverLetter: (jobId) => apiClient.post(`/jobs/${jobId}/cover-letter`).then(unwrap),
  interviewPrep: (jobId) => apiClient.post(`/jobs/${jobId}/interview-prep`).then(unwrap),

  // Skill Test Arena
  generateSkillTest: (body) => apiClient.post('/arena/tests', body).then(unwrap),
  evaluateSkillTest: (testId, answers, telemetry) => apiClient.post(`/arena/tests/${testId}/submit`, { answers, telemetry }).then(unwrap),
  getSkillMedals: () => apiClient.get('/arena/medals').then(unwrap),
  getLeaderboard: () => apiClient.get('/arena/leaderboard').then(unwrap),

  // Career Coach Chat
  careerChat: (body) => apiClient.post('/chat/messages', body).then(unwrap),
  listThreads: () => apiClient.get('/chat/threads').then(unwrap),
  getThreadMessages: (threadId) => apiClient.get(`/chat/threads/${threadId}`).then(unwrap),
  deleteThread: (threadId) => apiClient.delete(`/chat/threads/${threadId}`).then(unwrap),

  // Career DNA
  careerDna: () => apiClient.post('/career/dna').then(unwrap),
  getCareerDna: () => apiClient.get('/career/dna').then(unwrap),

  // Mock Interview Simulator
  startInterview: (body) => apiClient.post('/interviews/start', body).then(unwrap),
  submitInterview: (id, answers) => apiClient.post(`/interviews/${id}/submit`, { answers }).then(unwrap),
  listInterviews: () => apiClient.get('/interviews').then(unwrap),
  getInterview: (id) => apiClient.get(`/interviews/${id}`).then(unwrap),
};
