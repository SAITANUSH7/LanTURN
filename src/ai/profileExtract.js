// Pull profile fields out of resume text with plain rules (free, deterministic). The user can always edit them afterwards.
const CITIES = ['Hyderabad', 'Secunderabad', 'Bengaluru', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'New Delhi', 'Noida', 'Gurgaon', 'Gurugram', 'Kolkata', 'Ahmedabad', 'Kochi', 'Visakhapatnam', 'Vizag', 'Warangal', 'Vijayawada', 'Coimbatore', 'Jaipur', 'Indore', 'Bhubaneswar', 'Chandigarh', 'Nagpur', 'Lucknow', 'Remote'];
const BRANCHES = [
  [/computer science and engineering|computer science|\bcse\b/i, 'CSE'], [/artificial intelligence|\bai\s*(&|and)\s*ml\b|\baiml\b|\bcse\s*\(ai\)/i, 'CSE (AI)'], [/data science/i, 'Data Science'],
  [/information technology|\bit\b(?= engineering| branch|,|\))/i, 'IT'], [/electronics (and|&) communication|\bece\b/i, 'ECE'], [/electrical (and|&) electronics|\beee\b/i, 'EEE'],
  [/mechanical/i, 'Mechanical'], [/civil/i, 'Civil'], [/electrical/i, 'Electrical'],
];
const DEGREES = [[/\bb\.?\s?tech\b|bachelor of technology/i, 'B.Tech'], [/\bb\.?\s?e\.?\b(?=[\s,(-])|bachelor of engineering/i, 'B.E'], [/\bm\.?\s?tech\b|master of technology/i, 'M.Tech'], [/\bbca\b/i, 'BCA'], [/\bmca\b/i, 'MCA'], [/\bb\.?\s?sc\b/i, 'B.Sc'], [/\bm\.?\s?sc\b/i, 'M.Sc'], [/\bmba\b/i, 'MBA'], [/\bdiploma\b/i, 'Diploma']];
const NOT_NAME = /resume|curriculum|vitae|profile|summary|objective|contact|email|phone|education|skills|experience|projects|address|linkedin|github/i;

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function extractProfile(text) {
  const lines = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = { name: '', college: '', degree: '', branch: '', graduationYear: null, location: '' };

  for (const l of lines.slice(0, 6)) {
    const words = l.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z.'\- ]+$/.test(l) && !NOT_NAME.test(l) && l.length <= 40) { out.name = l === l.toUpperCase() ? titleCase(l) : l; break; }
  }
  const collegeLine = lines.find((l) => /(university|institute|college|\biit\b|\bnit\b|\biiit\b|\bbits\b|vidyalaya|polytechnic)/i.test(l) && l.length <= 140 && !/@/.test(l));
  if (collegeLine) {
    const m = collegeLine.match(/([A-Z][A-Za-z&.'\- ]{2,80}?(?:University|Institute of [A-Za-z ]+|Institute|College of [A-Za-z ]+|College|Polytechnic)(?: of [A-Za-z ]{3,40})?)/);
    out.college = (m ? m[1] : collegeLine).replace(/\s{2,}/g, ' ').replace(/[,\-–|]\s*$/, '').trim().slice(0, 120);
  }
  const edu = lines.filter((l) => /b\.?\s?tech|b\.?\s?e\b|bachelor|m\.?\s?tech|master|mba|bca|mca|b\.?\s?sc|diploma|engineering|university|college|institute/i.test(l)).join(' \n ') || text;
  for (const [re, label] of DEGREES) if (re.test(edu)) { out.degree = label; break; }
  for (const [re, label] of BRANCHES) if (re.test(edu)) { out.branch = label; break; }
  const range = String(text).match(/\b20[1-3]\d\s*(?:[-–—]|to)\s*(20[2-3]\d)\b/i);
  const years = [...edu.matchAll(/\b(20[2-3]\d)\b/g)].map((m) => Number(m[1]));
  if (range) out.graduationYear = Number(range[1]);
  else if (years.length) out.graduationYear = Math.max(...years);
  const head = lines.slice(0, 12).join(' ');
  const city = CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(head)) || CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(text));
  if (city) out.location = city === 'Bangalore' ? 'Bengaluru' : city === 'Vizag' ? 'Visakhapatnam' : city;
  return out;
}
