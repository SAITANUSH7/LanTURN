import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ROOT, config } from './config.js';
import { db } from './db.js';
import { HttpError } from './util.js';
import { authRouter, meRouter } from './routes/auth.js';
import { studentRouter } from './routes/student.js';
import { jobsRouter } from './routes/jobs.js';
import { employerRouter, adminRouter } from './routes/employer.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
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

  if (!config.isTest) {
    const limiter = (max, windowMs = 60_000) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } } });
    app.use('/api', limiter(240));
    app.use('/api/auth/login', limiter(10));
    app.use('/api/auth/register', limiter(10));
    app.use('/api/resumes', limiter(30));
    app.use('/api/career', limiter(20));
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', ai: config.anthropicKey && config.llmModel ? 'llm+rules' : 'rules', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api', studentRouter, jobsRouter, employerRouter, adminRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown API route')));

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: config.isProd ? '1h' : 0 }));

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
    res.status(status).json({ error: { code, message, details, requestId: req.id } });
  });

  return app;
}
