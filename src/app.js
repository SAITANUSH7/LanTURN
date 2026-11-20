import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ROOT, config } from './config.js';
import { llmEnabled, providerSummary } from './ai/providers.js';
import { db } from './db.js';
import { HttpError } from './util.js';
import { authRouter, meRouter } from './routes/auth.js';
import { studentRouter } from './routes/student.js';
import { aiRouter } from './routes/ai.js';
import { jobsRouter } from './routes/jobs.js';
import { employerRouter, adminRouter } from './routes/employer.js';
import { networkingRouter } from './routes/networking.js';
import { careerRoadmapsRouter } from './routes/careerRoadmaps.js';
import { careerMapRouter } from './routes/careerMap.js';
import { compatRouter } from './routes/compat.js';
import { drivesRouter } from './routes/drives.js';
import { realtimeRouter } from './realtime.js';
import { apiHeaders, sameOriginGuard } from './security.js';
import { requestMetrics } from './metrics.js';
import { reportError } from './monitor.js';
import { opsRouter } from './routes/ops.js';
import { studentToolsRouter } from './routes/studentTools.js';
import './tasks.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(requestMetrics);
  app.use(compression({ threshold: 1024, filter: (req, res) => (req.path.endsWith('/realtime/stream') ? false : compression.filter(req, res)) }));

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://api.dicebear.com'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiHeaders);
  app.use('/api/auth', sameOriginGuard);

  if (!config.isTest && process.env.DISABLE_RATE_LIMIT !== '1') { // DISABLE_RATE_LIMIT is for load tests only
    const limiter = (max, windowMs = 60_000) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } } });
    app.use('/api', limiter(240));
    app.use('/api/auth/login', limiter(10));
    app.use('/api/auth/register', limiter(10));
    app.use('/api/resumes', limiter(30));
    app.use('/api/career', limiter(20));
    app.use('/api/chat', limiter(20));
    app.use('/api/arena', limiter(20));
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', ai: llmEnabled() ? 'llm+rules' : 'rules', providers: providerSummary().map((p) => p.name), time: new Date().toISOString() });
  });

  let statsCache = { at: 0, body: null };
  app.get('/api/platform/stats', (_req, res) => {
    if (statsCache.body && Date.now() - statsCache.at < 10_000) return res.json(statsCache.body);
    const one = (sql) => (db.prepare(sql).get()?.n || 0);

    const studentsCount = one("SELECT COUNT(*) AS n FROM users WHERE role = 'STUDENT'");
    const employersCount = one("SELECT COUNT(*) AS n FROM users WHERE role = 'EMPLOYER'");
    const openJobsCount = one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'OPEN'");
    const applicationsCount = one("SELECT COUNT(*) AS n FROM applications");
    const verifiedSkillsCount = one("SELECT COUNT(*) AS n FROM skill_medals");
    const upcomingDrivesCount = one("SELECT COUNT(*) AS n FROM placement_drives WHERE status = 'UPCOMING'");

    const body = {
      studentsCount,
      employersCount,
      openJobsCount,
      applicationsCount,
      verifiedSkillsCount,
      upcomingDrivesCount,
      college: config.collegeName,
    };
    statsCache = { at: Date.now(), body };
    res.json(body);
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api', studentRouter, jobsRouter, employerRouter, aiRouter, adminRouter, opsRouter, studentToolsRouter, networkingRouter, careerRoadmapsRouter, careerMapRouter, compatRouter, drivesRouter, realtimeRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown API route')));

  const frontendDist = path.join(ROOT, 'frontend', 'dist');
  const publicDir = path.join(ROOT, 'public');

  if (config.useReact && fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { maxAge: config.isProd ? '1h' : 0 }));
  }
  app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));

  // SPA fallback for frontend client-side routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (config.useReact && fs.existsSync(path.join(frontendDist, 'index.html'))) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    if (fs.existsSync(path.join(publicDir, 'index.html'))) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL';
    let message = 'Something went wrong on our side';
    let details;
    if (err instanceof HttpError) ({ status, code, message, details } = err);
    else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = err.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR';
      message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 4 MB' : err.message;
    } else if (err.type === 'entity.parse.failed') {
      status = 400; code = 'VALIDATION_ERROR'; message = 'Request body is not valid JSON';
    } else if (err.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large';
    } else {
      console.error(`[${req.id}]`, err);
    }
    if (status >= 500) reportError(err, { extra: { route: `${req.method} ${req.route?.path || req.path}`, requestId: req.id } });
    res.status(status).json({ error: { code, message, details, requestId: req.id } });
  });

  return app;
}
