process.env.NODE_ENV = 'test';
process.env.SEED_DEMO = 'false';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.UPLOAD_DIR = './data/test-uploads';

const { createApp } = await import('../src/app.js');
const { seedTaxonomy, seedAdmin } = await import('../src/seed.js');

seedTaxonomy();
seedAdmin();

let server;
let base;
export async function start() {
  const app = createApp();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
}
export const stop = () => new Promise((r) => server.close(r));

export async function api(method, path, { token, body, form, cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: json, headers: res.headers, text };
}

/** Build a small valid text PDF (one page) from lines of text. */
export function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, '\\$&');
  let y = 780;
  const content = lines.map((l) => { const t = `BT /F1 10 Tf 40 ${y} Td (${esc(l)}) Tj ET`; y -= 13; return t; }).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export const RESUME_LINES = [
  'Student Test', 'student.test@example.com | +91 98765 43210 | github.com/studenttest',
  'Summary', 'Android developer focused on Kotlin and Jetpack Compose with a strong interest in clean architecture.',
  'Education', 'B.Tech in Computer Science and Engineering, Example Institute of Technology, 2027, CGPA 8.4',
  'Skills', 'Kotlin, Jetpack Compose, Android, MVVM, Retrofit, REST APIs, Git, SQL, Python',
  'Projects',
  '- Built a placement tracker app in Kotlin and Jetpack Compose used by 120 students across two colleges',
  '- Designed a REST API integration with Retrofit and reduced screen load time by 35 percent',
  '- Implemented MVVM architecture with unit tests covering 70 percent of the view models',
  '- Developed a Python script that analyzed 5000 job postings to rank in-demand skills',
  '- Collaborated with a team of four to ship the app to 3 internal testers in six weeks',
  'Experience', '- Android intern at Example Labs, built two features and fixed 18 bugs in a quarter',
  '- Led a weekly code review for a team of five interns and wrote documentation for new joiners',
];

export function pdfForm(lines = RESUME_LINES, extra = {}) {
  const f = new FormData();
  f.append('file', new Blob([makePdf(lines)], { type: 'application/pdf' }), 'resume.pdf');
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
}

let n = 0;
export async function register(role, extra = {}) {
  n += 1;
  const email = `${role.toLowerCase()}${n}-${Date.now()}@example.test`;
  const body = { email, password: 'Passw0rd!x', role, ...(role === 'STUDENT' ? { fullName: `Student ${n}` } : { companyName: `Company ${n}` }), ...extra };
  const r = await api('POST', '/auth/register', { body });
  return { ...r.body, email, status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

export async function login(email, password) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  return r.body.accessToken;
}
