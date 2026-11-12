import { savePdfPage, getPdfPage } from './persistenceService.js';

async function fingerprintPdfBytes(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // 非安全上下文下的内容敏感退路；仍能区分同名不同内容的文件。
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `${bytes.length}-${(hash >>> 0).toString(16)}`;
}

export function buildPdfPageCacheKey(reportName, pageRange, fingerprint) {
  return `${reportName}[${pageRange}]@${fingerprint}`;
}

export async function fingerprintPdfFile(pdfFile) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  return {
    arrayBuffer,
    fingerprint: await fingerprintPdfBytes(arrayBuffer)
  };
}

/**
 * 解析 pdf_numbers 字符串为页码数组
 * 支持格式：单页 "10"、逗号分隔 "10,11,12"、范围 "10-12"、混合 "10-12,50-54"
 * 返回 1-indexed 页码数组，已去重、升序排列
 */
export function parsePdfNumbers(pdfNumbersStr) {
  const result = new Set();
  const raw = String(pdfNumbersStr || '').trim();
  if (!raw) return [];

  const parts = raw.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const dashIndex = trimmed.indexOf('-');
    if (dashIndex > 0) {
      const start = parseInt(trimmed.slice(0, dashIndex).trim(), 10);
      const end = parseInt(trimmed.slice(dashIndex + 1).trim(), 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i += 1) {
          result.add(i);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) result.add(num);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * 从完整 PDF 文件中提取指定页面，返回 { pdfData: Uint8Array, pageOffset: number }
 * pageOffset 为原始 PDF 中的最小页码，用于将 LLM 返回的相对页码还原为原始页码
 *
 * 优先从 IndexedDB 缓存读取，缓存未命中时切分后写入缓存
 *
 * @param {File} pdfFile - 完整 PDF 文件
 * @param {number[]} pageNumbers - 1-indexed 物理页码列表
 * @param {string} [reportName] - 报告名（用于缓存 key）
 * @returns {Promise<{ pdfData: Uint8Array, pageOffset: number }>}
 */
export async function extractPdfPages(pdfFile, pageNumbers, reportName) {
  const pageRange = pageNumbers.join(',');
  const { arrayBuffer, fingerprint } = await fingerprintPdfFile(pdfFile);
  const cacheKey = reportName ? buildPdfPageCacheKey(reportName, pageRange, fingerprint) : null;

  // 缓存键绑定文件内容指纹；旧版仅按文件名建立的缓存自然失效。
  if (cacheKey) {
    const cached = await getPdfPage(cacheKey);
    if (cached) {
      return { pdfData: cached.pdfData, pageOffset: pageNumbers[0] || 1 };
    }
  }

  const { PDFDocument } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = srcDoc.getPageCount();

  const validIndices = pageNumbers
    .filter((n) => n >= 1 && n <= totalPages)
    .map((n) => n - 1); // pdf-lib 使用 0-indexed

  if (validIndices.length === 0) {
    throw new Error(`指定页码超出 PDF 范围（共 ${totalPages} 页），页码：${pageNumbers.join(', ')}`);
  }

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
  copiedPages.forEach((page) => newDoc.addPage(page));

  const pdfData = await newDoc.save();

  // 写入缓存
  if (cacheKey) {
    try {
      await savePdfPage(cacheKey, reportName || '', pageRange, pdfData);
    } catch (_) {
      // 缓存写入失败不阻断主流程
    }
  }

  return { pdfData, pageOffset: pageNumbers[0] || 1 };
}

/**
 * 将 Uint8Array 转为 Base64 字符串（用于 Gemini API 的 inline_data）
 */
export function uint8ArrayToBase64(bytes) {
  const chunkSize = 8192;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}
