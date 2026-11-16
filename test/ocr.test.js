import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, api, register, login, getOrigin } from './helpers.js';
import { __setFetch } from '../src/ai/providers.js';

before(start);
after(() => { __setFetch(null); return stop(); });

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]);
const upload = async (token, buf, name = 'resume.png') => {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name);
  fd.append('consent', 'true');
  const r = await fetch(`${getOrigin()}/api/resumes`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  return { status: r.status, body: await r.json() };
};
const RESUME = 'Asha Rao. Software engineer. Skills: Node.js, Express, SQL, Docker, React. '.repeat(6);

test('image resume is rejected cleanly when no vision provider is configured', async () => {
  const stu = await register('STUDENT');
  const r = await upload(stu.accessToken, png);
  assert.equal(r.status, 422);
  assert.match(r.body.error.message, /vision/i);
});

test('image resume is read by the vision model and analysed', async () => {
  const admin = await login('admin@test.local', 'Admin@12345');
  const seen = [];
  __setFetch(async (_url, init) => { seen.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: RESUME } }] }), { status: 200 }); });
  assert.equal((await api('PUT', '/admin/ai/nvidia', { token: admin, body: { apiKey: 'nvapi-test-0000000000' } })).status, 200);
  const stu = await register('STUDENT');
  const r = await upload(stu.accessToken, png);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const ocr = seen[0];
  assert.match(ocr.model, /nemotron-3\.5-super-vl/);
  assert.equal(ocr.messages.at(-1).content[1].type, 'image_url');
  assert.match(ocr.messages.at(-1).content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(ocr.chat_template_kwargs.enable_thinking, false);
  const list = await api('GET', '/resumes', { token: stu.accessToken });
  assert.equal(list.body.items.length, 1);
  await api('DELETE', '/admin/ai/nvidia', { token: admin });
});

test('unknown file types are refused', async () => {
  const stu = await register('STUDENT');
  assert.equal((await upload(stu.accessToken, Buffer.from('hello world'.repeat(40)), 'x.txt')).status, 415);
});
