export function parseExcel(file) {
  const readWorkbook = async (arrayBuffer) => {
    const XLSX = await import('xlsx');
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
  };

  if (typeof file?.arrayBuffer === 'function') {
    return file.arrayBuffer().then(readWorkbook);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        resolve(await readWorkbook(event.target.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

export async function parseDocx(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) {
    throw new Error('DOCX 文件缺少 word/document.xml，无法解析正文。');
  }

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  if (!parser) {
    throw new Error('当前环境不支持 DOMParser，无法解析 DOCX。');
  }

  const xml = parser.parseFromString(documentXml, 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagName('w:p')).map((paragraph) => {
    const textNodes = Array.from(paragraph.getElementsByTagName('w:t'));
    return textNodes.map((node) => node.textContent || '').join('').trim();
  }).filter(Boolean);

  return paragraphs.join('\n');
}

export async function parsePDF(file, onProgress) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js is not loaded.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    if (pageIndex % 10 === 0 || pageIndex === pdf.numPages) {
      onProgress?.(`Extracting PDF text (Page ${pageIndex}/${pdf.numPages})...`, Math.round((pageIndex / pdf.numPages) * 15));
    }
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item) => item.str);
    pages.push({ pageNumber: pageIndex, text: strings.join(' ') });
  }

  return pages;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
}
