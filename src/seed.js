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
  const hash = bcrypt.hashSync(config.adminPassword, 10);
  const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(config.adminEmail);
  if (!row) {
    db.prepare("INSERT INTO users (email, password_hash, role, verification) VALUES (?,?, 'ADMIN', 'VERIFIED')")
      .run(config.adminEmail, hash);
    return;
  }
  // ADMIN_PASSWORD env var is authoritative: if it changed since the admin was first created,
  // re-hash and update so the operator can reset the admin password simply by redeploying.
  if (!bcrypt.compareSync(config.adminPassword, row.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.id);
  }
}

const skillId = (slug) => db.prepare('SELECT id FROM skills WHERE slug = ?').get(slug)?.id;

/** Synthetic demo data. Names and emails are obviously fake. */
/** One-time: make student.three a clean, real-feeling account (no demo skills, applications or profile). */
function blankStudentThree() {
  if (db.prepare("SELECT 1 FROM app_flags WHERE key = 'student3_blank_v1'").get()) return;
  const u = db.prepare("SELECT id FROM users WHERE email = 'student.three@example.test'").get();
  if (u) {
    tx(() => {
      for (const [table, col] of [['student_skills', 'user_id'], ['applications', 'student_id'], ['drive_registrations', 'student_id'], ['skill_tests', 'student_id'], ['skill_medals', 'student_id'], ['career_dna', 'student_id'], ['saved_jobs', 'student_id'], ['mock_interviews', 'student_id'], ['career_roadmaps', 'student_id'], ['resumes', 'student_id'], ['notifications', 'user_id'], ['chat_threads', 'user_id']]) {
        try { db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(u.id); } catch { /* table or column not present */ }
      }
      db.prepare("UPDATE student_profiles SET college = '', degree = '', branch = '', graduation_year = NULL, location = '', headline = '', target_domain = NULL, auto_setup = NULL, auto_filled_at = NULL WHERE user_id = ?").run(u.id);
    });
  }
  db.prepare("INSERT OR IGNORE INTO app_flags (key, value) VALUES ('student3_blank_v1', '1')").run();
}

export function seedDemo() {
  blankStudentThree();
  const usersExist = db.prepare("SELECT 1 FROM users WHERE email = 'hr@examplecorp.test'").get();
  if (usersExist) {
    const drivesCount = db.prepare('SELECT count(*) as c FROM placement_drives').get()?.c || 0;
    if (drivesCount === 0) {
      const studentIds = db.prepare("SELECT id FROM users WHERE role = 'STUDENT' ORDER BY id").all().map((u) => u.id);
      const employerIds = db.prepare("SELECT id FROM users WHERE role = 'EMPLOYER' ORDER BY id").all().map((u) => u.id);
      const createdJobIds = db.prepare("SELECT id FROM jobs ORDER BY id").all().map((j) => j.id);

      if (studentIds.length > 0 && employerIds.length > 0) {
        tx(() => {
          const mockCount = db.prepare('SELECT count(*) as c FROM mock_interviews').get()?.c || 0;
          if (mockCount === 0) {
            db.prepare(`
              INSERT INTO mock_interviews (student_id, role_title, questions, answers, feedback, overall_score, status, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'rules')
            `).run(
              studentIds[0],
              'Android Platform Engineer',
              JSON.stringify([
                { q: 'How do you architect an offline-first Android application using Room and WorkManager?', kind: 'system_design', expectedCompetency: 'Offline Architecture' },
                { q: 'Explain how Jetpack Compose manages recomposition and state hoisting.', kind: 'technical', expectedCompetency: 'Jetpack Compose & Kotlin' },
                { q: 'Describe a project where you had to debug an elusive memory leak.', kind: 'behavioral', expectedCompetency: 'Problem Solving (STAR)' },
              ]),
              JSON.stringify([
                'I use Room with Flow for local persistence and WorkManager with exponential backoff for scheduled sync.',
                'Compose recomposition is triggered when snapshot state changes; state hoisting keeps composables stateless and testable.',
                'In a photo editing app, I used LeakCanary to detect an unreleased static Bitmap reference, replacing it with a lifecycle-aware ViewModel.',
              ]),
              JSON.stringify({
                overallScore: 88,
                readinessLevel: 'High Interview Readiness',
                summary: 'Candidate demonstrated high interview readiness for Android Platform Engineer with strong architectural clarity.',
                evaluations: [
                  { questionIndex: 0, score: 90, feedback: 'Excellent offline architecture design.', strengths: ['Clear component separation'], improvements: [] },
                  { questionIndex: 1, score: 85, feedback: 'Solid explanation of Compose state.', strengths: ['Accurate state hoisting logic'], improvements: [] },
                  { questionIndex: 2, score: 89, feedback: 'Concrete debugging metrics using LeakCanary.', strengths: ['Great STAR structure'], improvements: [] },
                ],
              }),
              88,
              'COMPLETED'
            );
          }

          if (createdJobIds.length >= 2) {
            db.prepare(`UPDATE jobs SET verified_by_admin = 1 WHERE id IN (${createdJobIds.slice(0, 2).join(',')})`).run();
            const insSaved = db.prepare(`INSERT OR IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)`);
            insSaved.run(studentIds[0], createdJobIds[0]);
            insSaved.run(studentIds[0], createdJobIds[1]);
          }

          const insDrive = db.prepare(`
            INSERT INTO placement_drives (company_name, title, description, drive_date, venue, eligibility, package_details, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'UPCOMING', ?)
          `);
          const d1 = Number(insDrive.run(
            'Google Cloud Engineering',
            'Campus Software Engineering Drive 2026',
            'Hiring Graduate Engineers for Cloud Infrastructure and Distributed Systems.',
            '2026-12-10',
            'Auditorium Block A & Online Sandbox',
            'B.Tech / M.Tech CS, IT, ECE (Min. 7.5 CGPA)',
            '24 - 32 LPA + Stock Grants',
            employerIds[0]
          ).lastInsertRowid);

          insDrive.run(
            'Microsoft IDC',
            'Full Stack & AI Engineer Placement Drive',
            'Opportunities across Azure Developer Division and Teams core intelligence.',
            '2026-12-18',
            'Campus Placement Hall 2',
            'B.Tech All Branches (Min. 7.0 CGPA)',
            '20 - 28 LPA',
            employerIds[1] || employerIds[0]
          );

          const insDriveReg = db.prepare(`INSERT OR IGNORE INTO drive_registrations (drive_id, student_id, status) VALUES (?, ?, 'REGISTERED')`);
          insDriveReg.run(d1, studentIds[0]);
          if (studentIds[1]) insDriveReg.run(d1, studentIds[1]);
        });
      }
    }
    return;
  }
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
      ['student.three@example.test', 'Student Three', '', '', '', null, '', []], // blank on purpose: fills itself from the resume you upload
    ];
    const insP = db.prepare('INSERT INTO student_profiles (user_id, full_name, college, degree, branch, graduation_year, location) VALUES (?,?,?,?,?,?,?)');
    const insSS = db.prepare("INSERT INTO student_skills (user_id, skill_id, source) VALUES (?,?,'MANUAL')");
    const studentIds = [];
    for (const [email, name, college, degree, branch, year, loc, skills] of students) {
      const id = mkUser(email, 'STUDENT', 'VERIFIED');
      insP.run(id, name, college, degree, branch, year, loc);
      for (const s of skills) {
        const sid = skillId(s);
        if (sid) insSS.run(id, sid);
      }
      studentIds.push(id);
    }

    // ---------- LanTURN 3.0 Demo Data ----------
    const createdJobIds = db.prepare('SELECT id FROM jobs WHERE employer_id IN (?, ?) ORDER BY id').all(employers[0], employers[1]).map(j => j.id);

    // 1. Applications with Match Scores
    if (createdJobIds.length >= 5) {
      const insApp = db.prepare(`INSERT INTO applications (job_id, student_id, match_score, status, cover_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now', '-2 days'), datetime('now', '-1 day'))`);
      insApp.run(createdJobIds[0], studentIds[0], 92, 'SHORTLISTED', 'Excited about the Android role! I have built several Kotlin Compose applications.');
      insApp.run(createdJobIds[3], studentIds[1], 81, 'APPLIED', 'Keen to apply my Python and SQL work on a real data team.');
      insApp.run(createdJobIds[4], studentIds[1], 88, 'INTERVIEW', 'Passionate about deep learning pipelines and production model training.');
    }

    // 2. Career DNA
    const insDna = db.prepare(`INSERT INTO career_dna (user_id, archetype, summary, dimensions, strengths, source, updated_at)
      VALUES (?, ?, ?, ?, ?, 'rules', datetime('now'))`);
    insDna.run(
      studentIds[0],
      'Mobile Platform Architect',
      'Strong in native Android, Kotlin, and reactive UI patterns with solid foundations in REST systems and Git workflows.',
      JSON.stringify([
        { name: 'Technical Depth', score: 88 },
        { name: 'System Design', score: 76 },
        { name: 'Execution Speed', score: 85 },
        { name: 'Collaboration', score: 80 }
      ]),
      JSON.stringify(['Native Android Architecture', 'Reactive UI with Compose', 'Clean Code Principles'])
    );
    insDna.run(
      studentIds[1],
      'Machine Learning Specialist',
      'Data science driven developer with core competence in machine learning algorithms, deep learning and data analysis.',
      JSON.stringify([
        { name: 'Mathematical Foundations', score: 90 },
        { name: 'Model Optimization', score: 82 },
        { name: 'Data Pipeline Design', score: 85 },
        { name: 'Analytical Thinking', score: 92 }
      ]),
      JSON.stringify(['Statistical Analysis', 'Deep Neural Networks', 'Pythonic Architecture'])
    );

    // 3. Skill Medals & Tests
    const insTest = db.prepare(`INSERT INTO skill_tests (user_id, skill, tier, status, questions, source) VALUES (?, ?, ?, 'DONE', '[]', 'rules')`);
    const t1 = Number(insTest.run(studentIds[0], 'Kotlin', 3).lastInsertRowid);
    const t2 = Number(insTest.run(studentIds[0], 'Git', 2).lastInsertRowid);
    const t3 = Number(insTest.run(studentIds[1], 'Python', 3).lastInsertRowid);
    const t4 = Number(insTest.run(studentIds[2], 'React', 3).lastInsertRowid);

    const insMedal = db.prepare(`INSERT INTO skill_medals (user_id, test_id, skill, medal, correct, feedback, source)
      VALUES (?, ?, ?, ?, ?, ?, 'rules')`);
    insMedal.run(studentIds[0], t1, 'Kotlin', 'Gold Medal', 3, JSON.stringify(['Demonstrated expert command of coroutines and syntax']));
    insMedal.run(studentIds[0], t2, 'Git', 'Silver Medal', 2, JSON.stringify(['Solid understanding of branching and merge strategies']));
    insMedal.run(studentIds[1], t3, 'Python', 'Gold Medal', 3, JSON.stringify(['Advanced proficiency in data structures and generators']));
    insMedal.run(studentIds[2], t4, 'React', 'Gold Medal', 3, JSON.stringify(['Strong grasp of hooks, state management, and component lifecycle']));

    // 4. Career AIsle Roadmaps & Progress
    const insCR = db.prepare(`INSERT INTO career_roadmaps (student_id, domain_id, domain_title) VALUES (?, ?, ?)`);
    const insRP = db.prepare(`INSERT INTO roadmap_progress (roadmap_id, student_id, stage_index, topic_index) VALUES (?, ?, ?, ?)`);

    const r1 = Number(insCR.run(studentIds[0], 'android', 'Android Development').lastInsertRowid);
    for (const [s, t] of [[0,0], [0,1], [0,2], [1,0]]) insRP.run(r1, studentIds[0], s, t);

    const r2 = Number(insCR.run(studentIds[1], 'aiml', 'AI & Machine Learning').lastInsertRowid);
    for (const [s, t] of [[0,0], [0,1], [0,2], [0,3], [1,0]]) insRP.run(r2, studentIds[1], s, t);

    const r3 = Number(insCR.run(studentIds[2], 'frontend', 'Frontend Development').lastInsertRowid);
    for (const [s, t] of [[0,0], [0,1], [0,2], [0,3], [1,0], [1,1]]) insRP.run(r3, studentIds[2], s, t);

    // 5. Professional Networking (Connections, Posts, DMs, Endorsements)
    const insConn = db.prepare(`INSERT INTO connections (requester_id, recipient_id, status, created_at, updated_at)
      VALUES (?, ?, 'ACCEPTED', datetime('now', '-3 days'), datetime('now', '-2 days'))`);
    insConn.run(studentIds[0], studentIds[1]);
    insConn.run(studentIds[0], studentIds[2]);
    insConn.run(employers[0], studentIds[0]);

    // Feed Posts
    const insPost = db.prepare(`INSERT INTO posts (author_id, content, post_type, likes_count, comments_count, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', ?))`);
    const p1 = Number(insPost.run(studentIds[0], 'Excited to share that I just earned the Gold Medal for Kotlin on the LanTURN Skill Arena! 🏆 Currently refining my native Android Compose showcase.', 'ACHIEVEMENT', 4, 2, '-1 day').lastInsertRowid);
    const p2 = Number(insPost.run(employers[0], 'We are hiring! Example Corp is looking for an Android Developer Intern to build Compose features with our core mobile engineering team in Hyderabad.', 'UPDATE', 6, 1, '-2 days').lastInsertRowid);
    insPost.run(studentIds[2], 'Built a collaborative Kanban task board using React 18, @dnd-kit, and TailwindCSS. Loving the new LanTURN 3.0 platform interface! ✨', 'PROJECT', 3, 0, '-3 hours');

    // Likes & Comments
    db.prepare(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`).run(studentIds[1], p1);
    db.prepare(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`).run(studentIds[2], p1);
    db.prepare(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`).run(employers[0], p1);
    db.prepare(`INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)`).run(studentIds[0], p2);

    db.prepare(`INSERT INTO post_comments (post_id, author_id, content, created_at) VALUES (?, ?, ?, datetime('now', '-18 hours'))`)
      .run(p1, studentIds[1], 'Congratulations! Well deserved.');
    db.prepare(`INSERT INTO post_comments (post_id, author_id, content, created_at) VALUES (?, ?, ?, datetime('now', '-12 hours'))`)
      .run(p1, employers[0], 'Great achievement, Student One! Keep up the momentum.');

    // Direct Messages
    const insMsg = db.prepare(`INSERT INTO direct_messages (sender_id, recipient_id, content, read_at, created_at)
      VALUES (?, ?, ?, datetime('now', ?), datetime('now', ?))`);
    insMsg.run(employers[0], studentIds[0], 'Hi Student One, we reviewed your profile and Kotlin skills. Would you be open for a short call about our Android internship?', '-5 hours', '-6 hours');
    insMsg.run(studentIds[0], employers[0], 'Hello! Thank you so much for reaching out. Yes, I would be delighted to speak about the role!', '-4 hours', '-4 hours');

    // Skill Endorsements
    const insEndorse = db.prepare(`INSERT INTO skill_endorsements (endorser_id, student_id, skill_id) VALUES (?, ?, ?)`);
    const kotlinId = skillId('kotlin');
    const gitId = skillId('git');
    const androidId = skillId('android');
    if (kotlinId) {
      insEndorse.run(studentIds[1], studentIds[0], kotlinId);
      insEndorse.run(employers[0], studentIds[0], kotlinId);
    }
    if (gitId) insEndorse.run(studentIds[1], studentIds[0], gitId);
    if (androidId) insEndorse.run(employers[0], studentIds[0], androidId);

    // 6. Mock Interview Sessions
    const insMock = db.prepare(`
      INSERT INTO mock_interviews (student_id, role_title, questions, answers, feedback, overall_score, status, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'rules')
    `);
    insMock.run(
      studentIds[0],
      'Android Platform Engineer',
      JSON.stringify([
        { q: 'How do you architect an offline-first Android application using Room and WorkManager?', kind: 'system_design', expectedCompetency: 'Offline Architecture' },
        { q: 'Explain how Jetpack Compose manages recomposition and state hoisting.', kind: 'technical', expectedCompetency: 'Jetpack Compose & Kotlin' },
        { q: 'Describe a project where you had to debug an elusive memory leak.', kind: 'behavioral', expectedCompetency: 'Problem Solving (STAR)' },
      ]),
      JSON.stringify([
        'I use Room with Flow for local persistence and WorkManager with exponential backoff for scheduled sync.',
        'Compose recomposition is triggered when snapshot state changes; state hoisting keeps composables stateless and testable.',
        'In a photo editing app, I used LeakCanary to detect an unreleased static Bitmap reference, replacing it with a lifecycle-aware ViewModel.',
      ]),
      JSON.stringify({
        overallScore: 88,
        readinessLevel: 'High Interview Readiness',
        summary: 'Candidate demonstrated high interview readiness for Android Platform Engineer with strong architectural clarity.',
        evaluations: [
          { questionIndex: 0, score: 90, feedback: 'Excellent offline architecture design.', strengths: ['Clear component separation'], improvements: [] },
          { questionIndex: 1, score: 85, feedback: 'Solid explanation of Compose state.', strengths: ['Accurate state hoisting logic'], improvements: [] },
          { questionIndex: 2, score: 89, feedback: 'Concrete debugging metrics using LeakCanary.', strengths: ['Great STAR structure'], improvements: [] },
        ],
      }),
      88,
      'COMPLETED'
    );

    // 7. Verified Jobs & Saved Jobs
    if (createdJobIds.length >= 3) {
      db.prepare(`UPDATE jobs SET verified_by_admin = 1 WHERE id IN (?, ?)`).run(createdJobIds[0], createdJobIds[1]);

      const insSaved = db.prepare(`INSERT OR IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)`);
      insSaved.run(studentIds[0], createdJobIds[0]);
      insSaved.run(studentIds[0], createdJobIds[1]);
      insSaved.run(studentIds[1], createdJobIds[2]);
    }

    // 8. Campus Placement Drives & Registrations
    const insDrive = db.prepare(`
      INSERT INTO placement_drives (company_name, title, description, drive_date, venue, eligibility, package_details, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'UPCOMING', ?)
    `);
    const d1 = Number(insDrive.run(
      'Google Cloud Engineering',
      'Campus Software Engineering Drive 2026',
      'Hiring Graduate Engineers for Cloud Infrastructure and Distributed Systems.',
      '2026-12-10',
      'Auditorium Block A & Online Sandbox',
      'B.Tech / M.Tech CS, IT, ECE (Min. 7.5 CGPA)',
      '24 - 32 LPA + Stock Grants',
      employers[0]
    ).lastInsertRowid);

    const d2 = Number(insDrive.run(
      'Microsoft IDC',
      'Full Stack & AI Engineer Placement Drive',
      'Opportunities across Azure Developer Division and Teams core intelligence.',
      '2026-12-18',
      'Campus Placement Hall 2',
      'B.Tech All Branches (Min. 7.0 CGPA)',
      '20 - 28 LPA',
      employers[1]
    ).lastInsertRowid);

    const insDriveReg = db.prepare(`INSERT OR IGNORE INTO drive_registrations (drive_id, student_id, status) VALUES (?, ?, 'REGISTERED')`);
    insDriveReg.run(d1, studentIds[0]);
    insDriveReg.run(d1, studentIds[1]);
    insDriveReg.run(d2, studentIds[2]);
  });
}
