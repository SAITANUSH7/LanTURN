export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const bad = (msg, details) => new HttpError(400, 'VALIDATION_ERROR', msg, details);
export const notFound = (msg = 'Not found') => new HttpError(404, 'NOT_FOUND', msg);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new HttpError(403, code, msg);
export const conflict = (msg, code = 'CONFLICT') => new HttpError(409, code, msg);

/** Wrap an async route so thrown errors reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse and validate with a zod schema, turning failures into 400s. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw bad(details[0] ? `${details[0].path || 'body'}: ${details[0].message}` : 'Invalid input', details);
  }
  return r.data;
}

export const page = (q) => {
  const p = Math.max(1, parseInt(q.page, 10) || 1);
  const size = Math.min(50, Math.max(1, parseInt(q.pageSize, 10) || 20));
  return { page: p, pageSize: size, offset: (p - 1) * size };
};
