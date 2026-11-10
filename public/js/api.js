// Thin API client. Access token lives in memory only; the refresh token is an httpOnly cookie.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshInFlight = null;
export const session = { user: null };
const listeners = new Set();
export const onSessionChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(session.user));

function setSession(data) {
  accessToken = data?.accessToken || null;
  session.user = data?.user || null;
  emit();
}

async function request(method, path, { body, form, raw } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (raw && res.ok) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Request failed (${res.status})`, e.details);
  }
  return data;
}

async function refresh(path = '/auth/refresh') {
  if (!refreshInFlight) {
    refreshInFlight = request('POST', path)
      .then((d) => { setSession(d); return true; })
      .catch(() => { setSession(null); return false; })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function api(method, path, opts) {
  try {
    return await request(method, path, opts);
  } catch (e) {
    if (e.status === 401 && e.code === 'UNAUTHENTICATED' && !path.startsWith('/auth/')) {
      if (await refresh()) return request(method, path, opts);
    }
    throw e;
  }
}

export const get = (p) => api('GET', p);
export const post = (p, body) => api('POST', p, { body });
export const put = (p, body) => api('PUT', p, { body });
export const patch = (p, body) => api('PATCH', p, { body });
export const del = (p) => api('DELETE', p);

export async function restoreSession() {
  await refresh('/auth/session');
  return session.user;
}
export async function login(email, password) {
  const d = await request('POST', '/auth/login', { body: { email, password } });
  setSession(d);
  return d.user;
}
export async function register(body) {
  const d = await request('POST', '/auth/register', { body });
  setSession(d);
  return d.user;
}
export async function logout() {
  try { await request('POST', '/auth/logout'); } catch { /* ignore */ }
  setSession(null);
}
export async function openPdf(resumeId) {
  const res = await api('GET', `/resumes/${resumeId}/file`, { raw: true });
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
export const reloadUser = async () => { const d = await api('GET', '/me'); session.user = d.user; emit(); return d.user; };
