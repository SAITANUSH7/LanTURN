import axios from 'axios';

let currentAccessToken = null;

export const setAccessToken = (token) => {
  currentAccessToken = token;
};

export const getAccessToken = () => currentAccessToken;

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to outgoing requests
apiClient.interceptors.request.use((config) => {
  if (currentAccessToken) {
    config.headers.Authorization = `Bearer ${currentAccessToken}`;
  }
  return config;
});

// Automatic token refresh interceptor on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      originalRequest._retry = true;
      try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken = res.data?.accessToken;
        if (newToken) {
          setAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        setAccessToken(null);
      }
    }

    const body = error.response?.data;
    const apiError = body?.error || { code: 'NETWORK_ERROR', message: error.message };
    const normalized = new Error(apiError.message || 'Request failed');
    normalized.code = apiError.code;
    normalized.details = apiError.details;
    normalized.status = error.response?.status;
    normalized.handled = true;
    return Promise.reject(normalized);
  }
);

/** Convenience: extract the `.data` payload or the entire response object */
export function unwrap(response) {
  return response?.data?.data !== undefined ? response.data.data : response?.data;
}
