import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { HttpError } from './errors.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info;
  } catch (_) {
    return null;
  }
}

export function createStaticHandler({ distDir, logger = console } = {}) {
  const root = path.resolve(distDir || path.resolve(process.cwd(), 'dist'));

  return async function serveStatic(req, res, urlPath) {
    if (!['GET', 'HEAD'].includes(req.method)) {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', '静态资源只支持 GET/HEAD。');
    }

    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch (_) {
      throw new HttpError(400, 'INVALID_PATH', '请求路径无效。');
    }

    if (decoded.includes('\0')) {
      throw new HttpError(400, 'INVALID_PATH', '请求路径无效。');
    }

    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    if (relative.split('/').some((part) => part.startsWith('.') && part !== '.well-known')) {
      throw new HttpError(403, 'FORBIDDEN_PATH', '不允许访问该路径。');
    }

    const candidate = path.resolve(root, relative);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      throw new HttpError(403, 'FORBIDDEN_PATH', '不允许访问该路径。');
    }

    let info = await fileExists(candidate);
    let filePath = candidate;

    if (info?.isDirectory()) {
      filePath = path.join(candidate, 'index.html');
      info = await fileExists(filePath);
    }

    if (!info) {
      const looksLikeAsset = path.extname(relative) !== '';
      if (looksLikeAsset) {
        throw new HttpError(404, 'NOT_FOUND', '文件不存在。');
      }
      filePath = path.join(root, 'index.html');
      info = await fileExists(filePath);
    }

    if (!info) {
      throw new HttpError(503, 'DIST_NOT_FOUND', '前端构建产物不存在，请先运行 npm run build。');
    }

    const isIndex = filePath.endsWith(`${path.sep}index.html`);
    const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', isIndex
      ? 'no-store'
      : (isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'));

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on('error', (error) => {
        logger.error?.('static_file_error', { filePath, message: error.message });
        reject(new HttpError(500, 'STATIC_READ_ERROR', '读取静态资源失败。'));
      });
      stream.on('end', resolve);
      stream.pipe(res);
    });
  };
}
