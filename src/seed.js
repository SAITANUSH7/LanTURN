import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { config } from './config.js';
import { SKILLS, ROLES } from './taxonomy.js';

/** Idempotently load the skill and role taxonomy. */
export function seedTaxonomy() {
  tx(() => {
    const insSkill = db.prepare('INSERT INTO skills (slug, name, category) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name, category=excluded.category');
    const getSkill = db.prepare('SELECT id FROM skills WHERE slug = ?');
    const insAlias = db.prepare('INSERT OR REPLACE INTO skill_aliases (alias, skill_id) VALUES (?,?)');
    for (const [slug, name, cat, aliases] of SKILLS) {
      insSkill.run(slug, name, cat);
      const { id } = getSkill.get(slug);
      for (const a of new Set([name.toLowerCase(), slug, ...aliases])) insAlias.run(a.toLowerCase(), id);
    }
    const insRole = db.prepare('INSERT INTO roles (slug, title, description) VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, description=excluded.description');
    const getRole = db.prepare('SELECT id FROM roles WHERE slug = ?');
    const insRS = db.prepare('INSERT OR REPLACE INTO role_skills (role_id, skill_id, weight) VALUES (?,?,?)');
    for (const [slug, title, desc, reqs] of ROLES) {
      insRole.run(slug, title, desc);
      const { id } = getRole.get(slug);
      for (const [s, w] of reqs) insRS.run(id, getSkill.get(s).id, w);
    }
  });
}

export function seedAdmin() {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminEmail);
  if (exists) return;
  db.prepare("INSERT INTO users (email, password_hash, role, verification) VALUES (?,?, 'ADMIN', 'VERIFIED')")
    .run(config.adminEmail, bcrypt.hashSync(config.adminPassword, 10));
}

const skillId = (slug) => db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)?.id;

/** Synthetic demo data. Names and emails are obviously fake. */
export function seedDemo() {
  if (db.prepare("SELECT 1 FROM users WHERE email = 'hr@examplecorp.test'").get()) return;
  const pw = bcrypt.hashSync('Demo@12345', 10);
  tx(() => {
    const mkUser = (email, role, ver) =>
      Number(db.prepare('INSERT INTO users (email, password_hash, role, verification) VALUES (?,?,?,?)').run(email, pw, role, ver).lastInsertRowid);

    const employers = [
      ['hr@examplecorp.test', 'Example Corp', 'Software', 'Hyderabad', 'Product company building developer tools.'],
      ['hiring@samplelabs.test', 'Sample Labs', 'AI Research', 'Bengaluru', 'Applied AI lab working on language and vision.'],
    ].map(([email, name, industry, loc, desc]) => {
      const id = mkUser(email, 'EMPLOYER', 'VERIFIED');
      db.prepare('INSERT INTO employer_profiles (user_id, company_name, industry, location, description) VALUES (?,?,?,?,?)').run(id, name, industry, loc, desc);
      return id;
    });
    const pending = mkUser('new@pendingco.test', 'EMPLOYER', 'PENDING');
    db.prepare('INSERT INTO employer_profiles (user_id, company_name, industry, location) VALUES (?,?,?,?)').run(pending, 'Pending Co', 'Retail', 'Chennai');

    const jobs = [
      [0, 'Android Developer Intern', 'Build features in our Kotlin and Jetpack Compose app alongside a mentor.', 'INTERNSHIP', 'Hyderabad', 0, [['kotlin', 3], ['jetpack-compose', 3], ['android', 2], ['git', 1]]],
      [0, 'Backend Engineer', 'Design and ship Node.js services backed by PostgreSQL.', 'FULL_TIME', 'Hyderabad', 0, [['nodejs', 3], ['rest-apis', 3], ['postgresql', 2], ['typescript', 2], ['docker', 1]]],
      [0, 'Full-Stack Developer', 'Own features from React UI to Express API.', 'FULL_TIME', 'Remote', 1, [['react', 3], ['nodejs', 3], ['express', 2], ['sql', 2], ['git', 1]]],
      [0, 'QA Engineer Intern', 'Write and automate tests for web and mobile releases.', 'INTERNSHIP', 'Hyderabad', 0, [['testing', 3], ['postman', 2], ['sql', 1], ['communication', 2]]],
      [1, 'ML Engineer', 'Train and deploy deep learning models for production.', 'FULL_TIME', 'Bengaluru', 0, [['python', 3], ['deep-learning', 3], ['pytorch', 3], ['docker', 2], ['git', 1]]],
      [1, 'Data Analyst Intern', 'Analyse product and research data and build dashboards.', 'INTERNSHIP', 'Remote', 1, [['sql', 3], ['excel', 2], ['data-analysis', 3], ['python', 2], ['tableau', 1]]],
      [1, 'AI Engineer', 'Build applications on top of large language models.', 'FULL_TIME', 'Bengaluru', 1, [['python', 3], ['llms', 3], ['nlp', 2], ['rest-apis', 2]]],
      [1, 'DevOps Engineer', 'Run our CI/CD and cloud infrastructure.', 'CONTRACT', 'Bengaluru', 0, [['linux', 3], ['docker', 3], ['ci-cd', 3], ['kubernetes', 2], ['aws', 2]]],
    ];
    const insJob = db.prepare('INSERT INTO jobs (employer_id, title, description, type, location, remote, compensation, created_at) VALUES (?,?,?,?,?,?,?, datetime(\'now\', ?))');
    const insJS = db.prepare('INSERT INTO job_skills (job_id, skill_id, weight) VALUES (?,?,?)');
    jobs.forEach(([e, title, desc, type, loc, remote, req], i) => {
      const id = Number(insJob.run(employers[e], title, desc, type, loc, remote, 'As per company norms', `-${i * 3} days`).lastInsertRowid);
      for (const [s, w] of req) insJS.run(id, skillId(s), w);
    });

    const students = [
      ['student.one@example.test', 'Student One', 'Example Institute of Technology', 'B.Tech', 'CSE (AI)', 2027, 'Hyderabad', ['kotlin', 'android', 'git', 'rest-apis', 'oop']],
      ['student.two@example.test', 'Student Two', 'Example Institute of Technology', 'B.Tech', 'CSE', 2026, 'Bengaluru', ['python', 'machine-learning', 'pandas', 'sql', 'git']],
      ['student.three@example.test', 'Student Three', 'Sample College of Engineering', 'B.Tech', 'IT', 2026, 'Remote', ['javascript', 'react', 'nodejs', 'html', 'css']],
    ];
    const insP = db.prepare('INSERT INTO student_profiles (user_id, full_name, college, degree, branch, graduation_year, location) VALUES (?,?,?,?,?,?,?)');
    const insSS = db.prepare("INSERT INTO student_skills (user_id, skill_id, source) VALUES (?,?,'MANUAL')");
    for (const [email, name, college, degree, branch, year, loc, skills] of students) {
      const id = mkUser(email, 'STUDENT', 'VERIFIED');
      insP.run(id, name, college, degree, branch, year, loc);
      for (const s of skills) insSS.run(id, skillId(s));
    }
  });
}
