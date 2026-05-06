import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { fileToBase64, parsePDF } from './fileParsers.js';
import { callLLMWithRetry, estimateCost } from './llmClient.js';
import { resolveSettingsWithPlatformDefaults } from '../utils/platformDefaultModel.js';

const PAGE_NOT_FOUND = '未找到';

const PAGE_LOCATOR_SYSTEM_PROMPT = `# Role: PDF页码定位与分割助手

## Goal
根据用户提供的多条“名称 + 描述”，在 PDF 中定位最相关的物理 PDF 页码，并返回可用于拆分 PDF 的结果。

## Rules
- 必须返回 PDF 物理页码，不是文档正文里印刷的页码。
- 每条输入都要单独返回结果。
- 如果最相关内容跨多页，可返回多个页码，例如 "12,13" 或 "12-14"。
- 如果找不到，返回 "${PAGE_NOT_FOUND}"。
- 输出必须严格为 JSON。

## Output Schema
{
  "results": [
    {
      "index": 1,
      "name": "章节名称",
      "description": "原始描述",
      "pdf_numbers": "12,13",
      "reason": "一句简短说明"
    }
  ]
}`;

function createProgressReporter(onProgress) {
  return (message, percentage = -1) => {
    onProgress?.({
      message,
      percentage,
      timestamp: new Date().toLocaleTimeString()
    });
  };
}

function cleanJsonText(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
}

function extractJsonPayload(text) {
  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('模型回复中没有找到合法 JSON 对象。');
  }
}

function getResultsArray(parsedData) {
  if (Array.isArray(parsedData)) return parsedData;
  if (Array.isArray(parsedData?.results)) return parsedData.results;
  return [];
}

function normalizeItems(items = []) {
  return items
    .map((item, index) => ({
      index: index + 1,
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim()
    }))
    .filter((item) => item.name && item.description);
}

function normalizePdfFiles(pdfFiles = []) {
  return (Array.isArray(pdfFiles) ? pdfFiles : [pdfFiles])
    .map((file) => file || null)
    .filter(Boolean);
}

function buildDurationLabel(durationMs) {
  return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
}

function sanitizeFilenamePart(value, fallback) {
  const sanitized = String(value || '')
    .replace(/[\\/?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || fallback;
}

function createZipFileName(pdfFiles) {
  const normalizedFiles = normalizePdfFiles(pdfFiles);
  if (normalizedFiles.length === 1) {
    const baseName = String(normalizedFiles[0].name || 'splitter')
      .replace(/\.pdf$/i, '')
      .replace(/[\\/?%*:|"<>]/g, ' ')
      .replace(/\s+/g, '_')
      .trim() || 'splitter';

    return `${baseName}_split_pages.zip`;
  }

  return `pdf_split_results_${normalizedFiles.length}_files.zip`;
}

function parsePageNumbers(value, totalPages) {
  const text = String(value || '').trim();
  if (!text || text === PAGE_NOT_FOUND) {
    return [];
  }

  const normalized = text
    .replace(/[，、；;｜|/]/g, ',')
    .replace(/[—–－~～至]/g, '-')
    .replace(/第\s*(\d+)\s*页/g, '$1')
    .replace(/pages?/gi, '')
    .replace(/page/gi, '')
    .replace(/\s+/g, '');

  const segments = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const pages = [];

  segments.forEach((segment) => {
    const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const stepStart = Math.min(start, end);
        const stepEnd = Math.max(start, end);
        for (let page = stepStart; page <= stepEnd; page += 1) {
          pages.push(page);
        }
      }
      return;
    }

    const numberMatches = segment.match(/\d+/g) || [];
    numberMatches.forEach((match) => {
      const page = Number(match);
      if (Number.isFinite(page)) {
        pages.push(page);
      }
    });
  });

  return [...new Set(pages)]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

async function createSplitPdfBytes(sourcePdf, pageNumbers) {
  const outputPdf = await PDFDocument.create();
  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    pageNumbers.map((page) => page - 1)
  );

  copiedPages.forEach((page) => outputPdf.addPage(page));
  return outputPdf.save();
}

async function locateSinglePdfPages({ pdfFile, items, settings, reportProgress }) {
  const runtimeSettings = resolveSettingsWithPlatformDefaults(settings);
  const apiUrl = String(runtimeSettings.apiUrl || '').trim();
  const apiKey = String(runtimeSettings.apiKey || '').trim();
  const modelName = String(runtimeSettings.modelName || '').trim();
  const isGemini = runtimeSettings.providerType === 'gemini' || apiUrl.includes('googleapis.com');

  let pdfBase64 = null;
  let documentText = '';

  if (isGemini) {
    pdfBase64 = await fileToBase64(pdfFile);
    reportProgress('已按 Gemini 多模态方式载入 PDF。', 20);
  } else {
    const pages = await parsePDF(pdfFile, (message, percentage) => {
      reportProgress(message, Math.min(20, percentage));
    });
    documentText = pages.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n');
    reportProgress('已在本地解析 PDF 文本。', 20);
  }

  const itemsBlock = items
    .map((item) => `${item.index}. 名称: ${item.name}\n描述: ${item.description}`)
    .join('\n\n');

  const userPrompt = isGemini
    ? `Items:\n${itemsBlock}\n\nPlease locate the most relevant physical PDF page number(s) for each item in the attached PDF.`
    : `Document:\n<document>\n${documentText}\n</document>\n\nItems:\n${itemsBlock}\n\nPlease locate the most relevant [Page X] marker(s) for each item.`;

  reportProgress('正在调用模型...', 36);

  const response = await callLLMWithRetry({
    sysPrompt: PAGE_LOCATOR_SYSTEM_PROMPT,
    userPrompt,
    apiUrl,
    apiKey,
    modelName,
    providerType: runtimeSettings.providerType,
    requestOptions: runtimeSettings.requestOptions,
    pdfBase64
  }, (message) => reportProgress(message, -1));

  reportProgress('正在解析模型回复...', 82);

  const parsedData = extractJsonPayload(response.text);
  const resultsArray = getResultsArray(parsedData);

  const mappedResults = items.map((item) => {
    const match = resultsArray.find((result) => Number(result?.index) === item.index)
      || resultsArray.find((result) => String(result?.name || '').trim() === item.name)
      || resultsArray.find((result) => String(result?.description || '').trim() === item.description);

    return {
      index: item.index,
      name: item.name,
      description: item.description,
      pdf_numbers: String(match?.pdf_numbers || PAGE_NOT_FOUND).trim() || PAGE_NOT_FOUND,
      reason: String(match?.reason || '').trim()
    };
  });

  return {
    results: mappedResults,
    usage: response.usage || { input_tokens: 0, output_tokens: 0 },
    modelName
  };
}

export async function locatePdfPages({ pdfFile, pdfFiles, items, settings, onProgress }) {
  const reportProgress = createProgressReporter(onProgress);
  const startTime = new Date();
  const normalizedItems = normalizeItems(items);
  const normalizedFiles = normalizePdfFiles(pdfFiles || pdfFile);

  if (normalizedFiles.length === 0) {
    throw new Error('请至少上传一份 PDF 文件。');
  }

  if (normalizedItems.length === 0) {
    throw new Error('请至少填写一组有效的名称和描述。');
  }

  const zip = new JSZip();
  const fileResults = [];
  let totalFoundCount = 0;
  let totalGeneratedFiles = 0;
  let totalMatchedPages = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  const totalFiles = normalizedFiles.length;
  const modelName = String(settings?.modelName || '').trim();

  for (let fileIndex = 0; fileIndex < normalizedFiles.length; fileIndex += 1) {
    const currentFile = normalizedFiles[fileIndex];
    const filePrefix = `[${fileIndex + 1}/${totalFiles}] ${currentFile.name}`;
    const reportFileProgress = (message, percentage = -1) => {
      const globalPercentage = percentage >= 0
        ? Math.min(99, Math.round(((fileIndex + (percentage / 100)) / totalFiles) * 100))
        : -1;

      reportProgress(`${filePrefix}: ${message}`, globalPercentage);
    };

    reportFileProgress('正在准备 PDF...', 5);

    let located;
    try {
      located = await locateSinglePdfPages({
        pdfFile: currentFile,
        items: normalizedItems,
        settings,
        reportProgress: reportFileProgress
      });
    } catch (error) {
      throw new Error(`${currentFile.name}: ${error.message}`);
    }

    reportFileProgress('正在生成分割 PDF...', 88);

    const pdfBytes = await currentFile.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const totalPages = sourcePdf.getPageCount();
    const safeFolderName = `${String(fileIndex + 1).padStart(2, '0')}_${sanitizeFilenamePart(
      currentFile.name.replace(/\.pdf$/i, ''),
      `file_${fileIndex + 1}`
    )}`;
    const zipFolder = zip.folder(safeFolderName);

    let fileFoundCount = 0;
    let fileGeneratedFiles = 0;
    let fileMatchedPages = 0;
    const mappedResults = [];

    for (let itemIndex = 0; itemIndex < located.results.length; itemIndex += 1) {
      const item = located.results[itemIndex];
      const pages = parsePageNumbers(item.pdf_numbers, totalPages);
      const generated = pages.length > 0;

      if (item.pdf_numbers !== PAGE_NOT_FOUND) {
        fileFoundCount += 1;
      }

      if (generated) {
        fileGeneratedFiles += 1;
        fileMatchedPages += pages.length;
        const fileName = `${String(item.index).padStart(2, '0')}_${sanitizeFilenamePart(item.name, `item_${item.index}`)}.pdf`;
        const splitPdfBytes = await createSplitPdfBytes(sourcePdf, pages);
        zipFolder?.file(fileName, splitPdfBytes);
      }

      mappedResults.push({
        ...item,
        matchedPages: pages,
        generated
      });

      reportFileProgress(
        `正在分割第 ${itemIndex + 1}/${located.results.length} 条...`,
        88 + Math.round(((itemIndex + 1) / located.results.length) * 10)
      );
    }

    totalFoundCount += fileFoundCount;
    totalGeneratedFiles += fileGeneratedFiles;
    totalMatchedPages += fileMatchedPages;
    totalInputTokens += located.usage?.input_tokens || 0;
    totalOutputTokens += located.usage?.output_tokens || 0;
    totalCost += estimateCost(modelName, located.usage?.input_tokens || 0, located.usage?.output_tokens || 0);

    fileResults.push({
      fileName: currentFile.name,
      totalPages,
      foundCount: fileFoundCount,
      generatedFiles: fileGeneratedFiles,
      totalMatchedPages: fileMatchedPages,
      results: mappedResults
    });
  }

  let zipBlob = null;
  if (totalGeneratedFiles > 0) {
    reportProgress('正在打包 ZIP...', 99);
    zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
  }

  const endTime = new Date();
  const durationMs = endTime - startTime;
  reportProgress(totalGeneratedFiles > 0 ? '完成，ZIP 已生成。' : '完成，没有匹配到可分割页码。', 100);

  return {
    fileResults,
    zipBlob,
    zipFileName: createZipFileName(normalizedFiles),
    stats: {
      totalFiles,
      totalItems: normalizedItems.length,
      totalSearches: normalizedFiles.length * normalizedItems.length,
      foundCount: totalFoundCount,
      generatedFiles: totalGeneratedFiles,
      totalMatchedPages,
      model: modelName,
      duration: buildDurationLabel(durationMs),
      totalInputTokens,
      totalOutputTokens,
      totalCost
    }
  };
}

export { PAGE_NOT_FOUND };
