import {
  PDFDocument,
  PDFRawStream,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFNumber,
  PDFStream
} from 'pdf-lib';
import pako from 'pako';

const DEFAULT_OPTIONS = {
  imageQuality: 0.1,
  maxImageDimension: 800,
  grayscale: false,
    smartMode: true,
    smartAreaThreshold: 60000
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getNumber(dict, key) {
  const obj = dict.get(PDFName.of(key));
  if (obj instanceof PDFNumber) return obj.asNumber ? obj.asNumber() : obj.value;
  if (obj && typeof obj.asNumber === 'function') return obj.asNumber();
  return undefined;
}

function getFilterNames(dict) {
  const filterObj = dict.get(PDFName.of('Filter'));
  if (!filterObj) return [];
  if (filterObj instanceof PDFName) return [filterObj.decodeText()];
  if (filterObj instanceof PDFArray) {
    const names = [];
    for (let i = 0; i < filterObj.size(); i += 1) {
      const item = filterObj.get(i);
      if (item instanceof PDFName) names.push(item.decodeText());
    }
    return names;
  }
  return [];
}

function getColorSpaceInfo(dict, context) {
  const csObj = dict.get(PDFName.of('ColorSpace'));
  if (!csObj) return { name: 'DeviceRGB', components: 3 };

  if (csObj instanceof PDFName) {
    const name = csObj.decodeText();
    switch (name) {
      case 'DeviceGray': return { name, components: 1 };
      case 'DeviceCMYK': return { name, components: 4 };
      case 'DeviceRGB':
      default: return { name: 'DeviceRGB', components: 3 };
    }
  }

  if (csObj instanceof PDFArray && csObj.size() >= 4) {
    const csType = csObj.get(0);
    if (csType instanceof PDFName && csType.decodeText() === 'Indexed') {
      const baseCs = csObj.get(1);
      let baseComponents = 3;
      if (baseCs instanceof PDFName) {
        const baseName = baseCs.decodeText();
        if (baseName === 'DeviceGray') baseComponents = 1;
        else if (baseName === 'DeviceCMYK') baseComponents = 4;
      }
      const maxIndex = csObj.get(2);
      const paletteSize = maxIndex instanceof PDFNumber ? (maxIndex.asNumber ? maxIndex.asNumber() : maxIndex.value) + 1 : 256;

      let palette;
      const paletteObj = csObj.get(3);
      if (paletteObj instanceof PDFRawStream) {
        palette = new Uint8Array(paletteObj.getContents());
      } else if (paletteObj instanceof PDFRef) {
        const resolved = context.lookup(paletteObj);
        if (resolved instanceof PDFRawStream) {
          palette = new Uint8Array(resolved.getContents());
        }
      } else if (typeof paletteObj?.decodeText === 'function') {
        const hex = paletteObj.decodeText();
        const cleaned = hex.replace(/\s/g, '');
        palette = new Uint8Array(cleaned.length / 2);
        for (let i = 0; i < palette.length; i += 1) {
          palette[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
        }
      }

      return {
        name: 'Indexed',
        components: baseComponents,
        palette: palette || new Uint8Array(paletteSize * baseComponents)
      };
    }

    const csType2 = csObj.get(0);
    if (csType2 instanceof PDFName) {
      const name = csType2.decodeText();
      if (name === 'ICCBased') {
        const profileRef = csObj.get(1);
        if (profileRef instanceof PDFRef) {
          const profile = context.lookup(profileRef);
          if (profile instanceof PDFRawStream || profile instanceof PDFStream) {
            const n = getNumber(profile.dict, 'N');
            if (n) return { name: 'ICCBased', components: n };
          }
        }
        return { name: 'ICCBased', components: 3 };
      }
      if (name === 'CalGray') return { name, components: 1 };
      if (name === 'CalRGB' || name === 'Lab') return { name, components: 3 };
    }
  }

  return { name: 'DeviceRGB', components: 3 };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(new Error(`Image load failed: ${event}`));
    img.src = src;
  });
}

async function decodeJpegToCanvas(jpegBytes) {
  const blob = new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rawPixelsToCanvas(bytes, width, height, colorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  if (colorSpace.name === 'Indexed' && colorSpace.palette) {
    const palette = colorSpace.palette;
    const baseComp = colorSpace.components;
    for (let i = 0; i < totalPixels; i += 1) {
      const idx = bytes[i] || 0;
      const offset = idx * baseComp;
      if (baseComp === 3) {
        data[i * 4] = palette[offset] || 0;
        data[i * 4 + 1] = palette[offset + 1] || 0;
        data[i * 4 + 2] = palette[offset + 2] || 0;
      } else if (baseComp === 1) {
        const gray = palette[offset] || 0;
        data[i * 4] = gray;
        data[i * 4 + 1] = gray;
        data[i * 4 + 2] = gray;
      }
      data[i * 4 + 3] = 255;
    }
  } else if (colorSpace.components === 1) {
    for (let i = 0; i < totalPixels; i += 1) {
      const gray = bytes[i] || 0;
      data[i * 4] = gray;
      data[i * 4 + 1] = gray;
      data[i * 4 + 2] = gray;
      data[i * 4 + 3] = 255;
    }
  } else if (colorSpace.components === 4) {
    for (let i = 0; i < totalPixels; i += 1) {
      const c = (bytes[i * 4] || 0) / 255;
      const m = (bytes[i * 4 + 1] || 0) / 255;
      const y = (bytes[i * 4 + 2] || 0) / 255;
      const k = (bytes[i * 4 + 3] || 0) / 255;
      data[i * 4] = Math.round(255 * (1 - c) * (1 - k));
      data[i * 4 + 1] = Math.round(255 * (1 - m) * (1 - k));
      data[i * 4 + 2] = Math.round(255 * (1 - y) * (1 - k));
      data[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < totalPixels; i += 1) {
      data[i * 4] = bytes[i * 3] || 0;
      data[i * 4 + 1] = bytes[i * 3 + 1] || 0;
      data[i * 4 + 2] = bytes[i * 3 + 2] || 0;
      data[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function removePngPredictor(data, width, height, bytesPerPixel) {
  const rowLen = width * bytesPerPixel;
  const stride = rowLen + 1;
  if (data.length < stride * height) return data;

  const result = new Uint8Array(width * height * bytesPerPixel);
  const prevRow = new Uint8Array(rowLen);

  for (let y = 0; y < height; y += 1) {
    const filterType = data[y * stride];
    const rowStart = y * stride + 1;
    const outStart = y * rowLen;

    for (let x = 0; x < rowLen; x += 1) {
      const raw = data[rowStart + x];
      const a = x >= bytesPerPixel ? result[outStart + x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel && y > 0 ? prevRow[x - bytesPerPixel] : 0;

      let val = raw;
      switch (filterType) {
        case 1: val = (raw + a) & 0xFF; break;
        case 2: val = (raw + b) & 0xFF; break;
        case 3: val = (raw + Math.floor((a + b) / 2)) & 0xFF; break;
        case 4: val = (raw + paethPredictor(a, b, c)) & 0xFF; break;
        default: break;
      }
      result[outStart + x] = val;
    }
    for (let x = 0; x < rowLen; x += 1) prevRow[x] = result[outStart + x];
  }

  return result;
}

async function decodeImage(stream, dict, context, imageIndex) {
  const width = getNumber(dict, 'Width');
  const height = getNumber(dict, 'Height');
  if (!width || !height || width < 2 || height < 2) return null;

  const filters = getFilterNames(dict);
  const rawBytes = stream.getContents();
  const colorSpace = getColorSpaceInfo(dict, context);
  const bpc = getNumber(dict, 'BitsPerComponent') || 8;

  let data = rawBytes;
  const remainingFilters = [...filters];

  if (remainingFilters[0] === 'FlateDecode') {
    try {
      data = pako.inflate(data);
      remainingFilters.shift();
    } catch {
      return null;
    }
  }

  if (remainingFilters[0] === 'DCTDecode') {
    try {
      return await decodeJpegToCanvas(data);
    } catch {
      return null;
    }
  }

  if (remainingFilters.includes('JPXDecode') || remainingFilters.includes('JBIG2Decode')) {
    return null;
  }

  if (remainingFilters.length > 0) {
    return null;
  }

  let pixelData = data;
  let predictor = 1;
  let dpColors = colorSpace.name === 'Indexed' ? 1 : colorSpace.components;
  let dpBpc = bpc;
  let dpColumns = width;

  const decodeParms = dict.get(PDFName.of('DecodeParms'));
  if (decodeParms instanceof PDFDict) {
    predictor = getNumber(decodeParms, 'Predictor') || 1;
    dpColors = getNumber(decodeParms, 'Colors') || dpColors;
    dpBpc = getNumber(decodeParms, 'BitsPerComponent') || dpBpc;
    dpColumns = getNumber(decodeParms, 'Columns') || dpColumns;
  } else if (decodeParms instanceof PDFArray && decodeParms.size() > 0) {
    const firstDP = decodeParms.get(0);
    if (firstDP instanceof PDFDict) {
      predictor = getNumber(firstDP, 'Predictor') || 1;
      dpColors = getNumber(firstDP, 'Colors') || dpColors;
      dpBpc = getNumber(firstDP, 'BitsPerComponent') || dpBpc;
      dpColumns = getNumber(firstDP, 'Columns') || dpColumns;
    }
  }

  if (bpc === 1 && colorSpace.name !== 'Indexed' && predictor <= 1) {
    const rowBytes = Math.ceil(width * dpColors / 8);
    const expected = rowBytes * height;
    if (pixelData.length >= expected) {
      const expanded = new Uint8Array(width * height * dpColors);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width * dpColors; x += 1) {
          const byteIdx = y * rowBytes + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          expanded[y * width * dpColors + x] = ((pixelData[byteIdx] >> bitIdx) & 1) ? 255 : 0;
        }
      }
      pixelData = expanded;
    }
  }

  if (predictor >= 10) {
    const bytesPerPixel = Math.ceil(dpColors * dpBpc / 8);
    const rowLen = Math.ceil(dpColumns * dpColors * dpBpc / 8);
    const stride = rowLen + 1;
    if (pixelData.length >= stride * height) {
      pixelData = removePngPredictor(pixelData, dpColumns, height, bytesPerPixel);
      if (bpc === 1 && colorSpace.name !== 'Indexed') {
        const rowBytes = Math.ceil(width * dpColors / 8);
        const expanded = new Uint8Array(width * height * dpColors);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width * dpColors; x += 1) {
            const byteIdx = y * rowBytes + Math.floor(x / 8);
            const bitIdx = 7 - (x % 8);
            expanded[y * width * dpColors + x] = ((pixelData[byteIdx] >> bitIdx) & 1) ? 255 : 0;
          }
        }
        pixelData = expanded;
      }
    }
  } else if (predictor === 2) {
    const bytesPerPixel = colorSpace.name === 'Indexed' ? 1 : colorSpace.components;
    const rowLen = width * bytesPerPixel;
    for (let y = 0; y < height; y += 1) {
      for (let x = bytesPerPixel; x < rowLen; x += 1) {
        pixelData[y * rowLen + x] = (pixelData[y * rowLen + x] + pixelData[y * rowLen + x - bytesPerPixel]) & 0xFF;
      }
    }
  } else if (predictor <= 1) {
    const bytesPerPixel = colorSpace.name === 'Indexed' ? 1 : colorSpace.components;
    const rowWithFilter = Math.ceil(width * bytesPerPixel * bpc / 8) + 1;
    if (pixelData.length === rowWithFilter * height && pixelData.length !== width * height * bytesPerPixel) {
      pixelData = removePngPredictor(pixelData, width, height, Math.ceil(bytesPerPixel * bpc / 8));
    }
  }

  let effectiveCS = colorSpace;
  const bytesPerPixel = colorSpace.name === 'Indexed' ? 1 : colorSpace.components;
  const expectedLen = width * height * bytesPerPixel;

  if (pixelData.length < expectedLen && pixelData.length >= width * height) {
    const actualComponents = Math.round(pixelData.length / (width * height));
    if (actualComponents >= 1 && actualComponents <= 4 && actualComponents !== colorSpace.components) {
      effectiveCS = {
        name: actualComponents === 1 ? 'DeviceGray' : actualComponents === 4 ? 'DeviceCMYK' : 'DeviceRGB',
        components: actualComponents
      };
    }
  }

  const effBpp = effectiveCS.name === 'Indexed' ? 1 : effectiveCS.components;
  const effExpected = width * height * effBpp;

  if (pixelData.length < effExpected) {
    if (effectiveCS.name === 'Indexed' && bpc < 8) {
      const pixelsPerByte = Math.floor(8 / bpc);
      const rowBytes = Math.ceil(width / pixelsPerByte);
      const packedLen = rowBytes * height;
      if (pixelData.length >= packedLen) {
        const mask = (1 << bpc) - 1;
        const expanded = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const byteIdx = y * rowBytes + Math.floor(x / pixelsPerByte);
            const shift = (pixelsPerByte - 1 - (x % pixelsPerByte)) * bpc;
            expanded[y * width + x] = (pixelData[byteIdx] >> shift) & mask;
          }
        }
        pixelData = expanded;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  return rawPixelsToCanvas(pixelData, width, height, effectiveCS, imageIndex);
}

function recompressToJpeg(sourceCanvas, options) {
  const origWidth = sourceCanvas.width;
  const origHeight = sourceCanvas.height;
  let newWidth = origWidth;
  let newHeight = origHeight;

  if (origWidth > options.maxImageDimension || origHeight > options.maxImageDimension) {
    const scale = options.maxImageDimension / Math.max(origWidth, origHeight);
    newWidth = Math.max(1, Math.round(origWidth * scale));
    newHeight = Math.max(1, Math.round(origHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext('2d');

  if (options.grayscale) {
    ctx.filter = 'grayscale(100%)';
  }

  ctx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight);

  const dataUrl = canvas.toDataURL('image/jpeg', options.imageQuality);
  const base64 = dataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return { jpegBytes: bytes, newWidth, newHeight };
}

export async function compressPdf(file, options = {}, onProgress) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.({ phase: '解析 PDF 结构...', current: 0, total: 0, originalSize });

  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const context = pdfDoc.context;
  const imageRefs = [];

  context.enumerateIndirectObjects().forEach(([ref, obj]) => {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict;
      const subtype = dict.get(PDFName.of('Subtype'));
      if (subtype instanceof PDFName && subtype.decodeText() === 'Image') {
        imageRefs.push({ ref, stream: obj, dict });
      }
    }
  });

  const totalImages = imageRefs.length;
  onProgress?.({
    phase: `找到 ${totalImages} 张图片，开始压缩...`,
    current: 0,
    total: totalImages,
    originalSize
  });

  let imagesProcessed = 0;
  let imagesSkipped = 0;

  for (let i = 0; i < imageRefs.length; i += 1) {
    const { ref, stream, dict } = imageRefs[i];
    const w = getNumber(dict, 'Width') || 0;
    const h = getNumber(dict, 'Height') || 0;
    const origBytes = stream.getContents().length;

    onProgress?.({
      phase: `压缩图片 ${i + 1}/${totalImages}（${w}×${h}，${formatBytes(origBytes)}）...`,
      current: i,
      total: totalImages,
      originalSize
    });

    try {
      const canvas = await decodeImage(stream, dict, context, i + 1);
      if (!canvas) {
        imagesSkipped += 1;
        continue;
      }


      let currentOpts = { ...opts };

      // 智能模式逻辑：识别并牺牲无关小图
      if (opts.smartMode) {
        const area = w * h;
        const isSmallIcon = area < (opts.smartAreaThreshold || 60000); // 小于 245x245 左右
        const isVeryThin = (w / h > 5) || (h / w > 5); // 极窄的分割线或装饰条

        if (isSmallIcon || isVeryThin) {
          currentOpts.imageQuality = 0.05; // 强制极低质量
          currentOpts.maxImageDimension = Math.min(w, h, 200); // 缩小尺寸
        }
      }

      const { jpegBytes, newWidth, newHeight } = recompressToJpeg(canvas, currentOpts);

      if (jpegBytes.length >= origBytes) {
        imagesSkipped += 1;
        continue;
      }

      const newDict = context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: newWidth,
        Height: newHeight,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
        Length: jpegBytes.length
      });

      const newStream = PDFRawStream.of(newDict, jpegBytes);
      context.assign(ref, newStream);
      imagesProcessed += 1;
    } catch {
      imagesSkipped += 1;
    }
  }

  onProgress?.({
    phase: '重建 PDF 文件...',
    current: totalImages,
    total: totalImages,
    originalSize
  });

  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false
  });

  const compressedSize = compressedBytes.length;
  const blob = new Blob([compressedBytes], { type: 'application/pdf' });

  return {
    originalSize,
    compressedSize,
    ratio: compressedSize / originalSize,
    blob,
    imagesProcessed,
    imagesSkipped
  };
}
