// Resume text from images and scanned PDFs, using the vision model. Text PDFs never come here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { visionText, llmEnabled } from './providers.js';

const run = promisify(execFile);
const INSTRUCTION = 'Transcribe all text of this resume exactly as written, in reading order. Keep section headings and bullet points on separate lines. Do not summarise, correct or add anything. If the image is not a resume or has no readable text, reply with exactly: NO_TEXT';

export function imageMime(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export const ocrAvailable = () => llmEnabled();

export async function textFromImage(buf, mime) {
  const t = await visionText({ instruction: INSTRUCTION, images: [{ mime, base64: buf.toString('base64') }] });
  return t === 'NO_TEXT' ? '' : t;
}

/** Scanned PDF: render the first pages to PNG with pdftoppm (poppler), then read them. Returns '' when poppler is missing. */
export async function textFromScannedPdf(buf, pages = 2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-ocr-'));
  try {
    const pdf = path.join(dir, 'in.pdf');
    fs.writeFileSync(pdf, buf, { mode: 0o600 });
    try { await run('pdftoppm', ['-r', '110', '-png', '-f', '1', '-l', String(pages), pdf, path.join(dir, 'p')], { timeout: 30000 }); } catch { return ''; }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    if (!files.length) return '';
    const images = files.map((f) => ({ mime: 'image/png', base64: fs.readFileSync(path.join(dir, f)).toString('base64') }));
    const t = await visionText({ instruction: INSTRUCTION, images });
    return t === 'NO_TEXT' ? '' : t;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
