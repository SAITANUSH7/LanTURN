// Design-system page: theme switch (shares the app's stored choice).
const root = document.documentElement;
const stored = () => { try { return localStorage.getItem('lanturn-theme'); } catch { return null; } };
const set = (t) => { root.dataset.theme = t; document.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t))); };
set(stored() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
document.querySelectorAll('[data-theme-btn]').forEach((b) => b.addEventListener('click', () => { try { localStorage.setItem('lanturn-theme', b.dataset.themeBtn); } catch { /* optional */ } set(b.dataset.themeBtn); }));
