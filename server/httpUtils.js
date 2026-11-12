import { HttpError } from './errors.js';

export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

export function sendJson(res, status, payload, headers = {}) {
  if (res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(body);
}

export function sendNoContent(res, status = 204, headers = {}) {
  if (res.writableEnded) return;
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end();
}

export function sendError(res, error) {
  if (res.writableEnded) return;
  if (error instanceof HttpError) {
    sendJson(res, error.status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
    return;
  }

  sendJson(res, 500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务内部错误，请稍后重试。'
    }
  });
}

export async function readJsonBody(req, { limit = 1024 * 1024 } = {}) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_CONTENT_TYPE', '请求必须使用 application/json。');
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '请求体超过服务端限制。');
    }
    chunks.push(chunk);
  }

  if (total === 0) {
    throw new HttpError(400, 'EMPTY_BODY', '请求体不能为空。');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) {
    throw new HttpError(400, 'INVALID_JSON', '请求体不是合法 JSON。');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'INVALID_BODY', '请求体必须是 JSON 对象。');
  }
  return parsed;
}

export function getClientIp(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function isSameOrigin(req, { trustProxy = false, allowedOrigins = [] } = {}) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) {
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const host = String(req.headers.host || '').trim();
  if (!host) return false;
  const forwardedProto = trustProxy ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');
  return origin === `${protocol}://${host}`;
}

export function requireHeader(req, name, expected = '1') {
  const value = String(req.headers[name.toLowerCase()] || '').trim();
  if (value !== expected) {
    throw new HttpError(403, 'CSRF_HEADER_MISSING', '缺少管理操作所需的请求头。');
  }
}

export function methodNotAllowed(res, allowed = []) {
  sendJson(res, 405, {
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: '请求方法不被允许。'
    }
  }, {
    Allow: allowed.join(', ')
  });
}

export function getRequestUrl(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}
