import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Slider, Switch, Text, Stack, Group, Divider, Paper } from '@mantine/core';
import { IconDownload, IconFileTypePdf, IconPlayerPlayFilled } from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { estimateBase64TokensFromBytes } from '../utils/tokenEstimation.js';

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

function formatPdfInfo(file) {
  return `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCount(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.max(0, Number(value) || 0));
}

function formatReduction(ratio) {
  return `${Math.max(0, Math.round((1 - ratio) * 100))}%`;
}

function simplifyPhase(phase) {
  if (phase.includes('解析')) return '解析 PDF';
  if (phase.includes('找到')) return '扫描图片';
  if (phase.includes('压缩图片')) return '压缩图片';
  if (phase.includes('重建')) return '重建文件';
  return phase;
}

export function CompressorTab() {
  const [pdfFile, setPdfFile] = useState(null);
  const [quality, setQuality] = useState(0.6);
  const [dimension, setDimension] = useState(1200);
  const [grayscale, setGrayscale] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [smartThreshold, setSmartThreshold] = useState(60000);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(createInitialProgress);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const lastPhaseRef = useRef('');

  const canStart = Boolean(pdfFile) && !isRunning;

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => () => {
    if (resultRef.current?.downloadUrl) {
      URL.revokeObjectURL(resultRef.current.downloadUrl);
    }
  }, []);

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }

    const originalBase64 = estimateBase64TokensFromBytes(result.originalSize);
    const compressedBase64 = estimateBase64TokensFromBytes(result.compressedSize);

    return {
      originalSize: formatBytes(result.originalSize),
      compressedSize: formatBytes(result.compressedSize),
      savedBytes: formatBytes(Math.max(0, result.originalSize - result.compressedSize)),
      reduction: formatReduction(result.ratio),
      originalBase64Characters: formatCount(originalBase64.base64Characters),
      originalBase64Tokens: formatCount(originalBase64.estimatedTokens),
      compressedBase64Characters: formatCount(compressedBase64.base64Characters),
      compressedBase64Tokens: formatCount(compressedBase64.estimatedTokens)
    };
  }, [result]);

  const appendProgress = ({ message, percentage, timestamp }) => {
    setProgress((previous) => ({
      visible: true,
      status: message || previous.status,
      percentage: percentage >= 0 ? percentage : previous.percentage,
      logs: [
        ...previous.logs,
        { id: `${Date.now()}-${Math.random()}`, time: timestamp, message }
      ],
      isLoading: percentage >= 0 ? percentage < 100 : previous.isLoading
    }));
  };

  const handlePdfSelect = (file) => {
    if (!file) return;

    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      window.alert(`请上传有效的 PDF 文件。无效文件：${file.name}`);
      return;
    }

    setPdfFile(file);
  };

  const handleCompress = async () => {
    if (!pdfFile) return;

    setIsRunning(true);
    if (result?.downloadUrl) {
      URL.revokeObjectURL(result.downloadUrl);
    }
    setResult(null);
    lastPhaseRef.current = '';
    setProgress({
      visible: true,
      status: '开始压缩 PDF...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    try {
      const { compressPdf } = await import('../services/pdfCompressorService.js');

      const compressionResult = await compressPdf(pdfFile, { 
        imageQuality: quality, 
        maxImageDimension: dimension, 
        grayscale, 
        smartMode, 
        smartAreaThreshold: smartThreshold 
      }, (fileProgress) => {
        let localProgress = 10;

        if (fileProgress.total > 0) {
          localProgress = Math.round((fileProgress.current / Math.max(fileProgress.total, 1)) * 90);
        }

        if (String(fileProgress.phase).includes('重建')) {
          localProgress = 95;
        }

        const shortPhase = simplifyPhase(String(fileProgress.phase));

        if (lastPhaseRef.current !== shortPhase) {
          lastPhaseRef.current = shortPhase;
          appendProgress({
            message: shortPhase,
            percentage: localProgress,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }

        setProgress((previous) => ({
          ...previous,
          visible: true,
          status: shortPhase,
          percentage: localProgress,
          isLoading: localProgress < 100
        }));
      });

      const downloadUrl = URL.createObjectURL(compressionResult.blob);
      setResult({
        fileName: pdfFile.name,
        originalSize: compressionResult.originalSize,
        compressedSize: compressionResult.compressedSize,
        ratio: compressionResult.ratio,
        downloadUrl
      });

      appendProgress({
        message: '压缩完成',
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } catch (error) {
      console.error(error);
      appendProgress({
        message: `压缩失败：${error.message}`,
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsRunning(false);
      setProgress((previous) => ({ ...previous, isLoading: false }));
    }
  };

  return (
    <section className="glass-panel main-panel compressor-simple">
      <UploadCard
        icon={<IconFileTypePdf size={26} stroke={1.8} />}
        tag="PDF"
        title="上传 PDF"
        hint="上传一份需要压缩的 PDF"
        acceptHint="当前仅支持单文件压缩"
        buttonLabel="选择 PDF"
        accept="application/pdf"
        file={pdfFile}
        onFileSelect={handlePdfSelect}
        formatFileInfo={formatPdfInfo}
      />

      <Paper withBorder radius="md" p="md" mb="xl" className="glass-panel-subtle" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
        <Stack gap="md">
          <Text fw={600} size="sm">压缩配置</Text>
          
          <div style={{ padding: '0 10px' }}>
            <Group justify="space-between" mb="xs">
              <Text size="xs" fw={500}>图像质量: {Math.round(quality * 100)}%</Text>
              <Text size="xs" c="dimmed">推荐: 60%-80% (多模态AI识别) | &lt; 20% (极致压缩)</Text>
            </Group>
            <Slider 
              value={quality} 
              onChange={setQuality} 
              min={0.05} 
              max={1.0} 
              step={0.05} 
              label={(val) => `${Math.round(val * 100)}%`}
              marks={[
                { value: 0.1, label: '极致' },
                { value: 0.6, label: '推荐' },
                { value: 0.9, label: '高清' }
              ]}
            />
          </div>

          <Divider variant="dashed" my="xs" />

          <div style={{ padding: '0 10px' }}>
            <Group justify="space-between" mb="xs">
              <Text size="xs" fw={500}>最大分辨率 (长边像素): {dimension}px</Text>
              <Text size="xs" c="dimmed">推荐: 1200-1600px (确保小字清晰)</Text>
            </Group>
            <Slider 
              value={dimension} 
              onChange={setDimension} 
              min={400} 
              max={3000} 
              step={100} 
              marks={[
                { value: 800, label: '低' },
                { value: 1600, label: '中' },
                { value: 2400, label: '高' }
              ]}
            />
          </div>

          <Divider variant="dashed" my="xs" />

          <Group justify="space-between">
            <Stack gap={2}>
              <Text size="xs" fw={500}>智能平衡模式 (Smart Mode)</Text>
              <Text size="10px" c="dimmed">自动识别并牺牲 Logo/装饰图，保全大图/文字清晰度</Text>
            </Stack>
            <Switch 
              checked={smartMode} 
              onChange={(event) => setSmartMode(event.currentTarget.checked)} 
              size="md"
              color="blue"
            />
          </Group>

          {smartMode && (
            <div style={{ padding: '0 10px', marginTop: '-5px' }}>
              <Group justify="space-between" mb="xs">
                <Text size="xs" fw={500}>智能判定阈值: {smartThreshold.toLocaleString()} 像素面积</Text>
                <Text size="10px" c="dimmed">小于此面积的图将强制以 5% 质量压缩。推荐: 4w - 10w</Text>
              </Group>
              <Slider 
                value={smartThreshold} 
                onChange={setSmartThreshold} 
                min={10000} 
                max={400000} 
                step={10000} 
                label={(val) => `${(val/1000).toFixed(0)}k px`}
                marks={[
                  { value: 40000, label: '小Logo' },
                  { value: 100000, label: '标准' },
                  { value: 250000, label: '大插图' }
                ]}
              />
              <div style={{ height: '15px' }} />
            </div>
          )}

          <Divider variant="dashed" my="xs" />

          <Group justify="space-between">
            <Stack gap={2}>
              <Text size="xs" fw={500}>开启灰度化 (Grayscale)</Text>
              <Text size="10px" c="dimmed">移除颜色以显著减少体积，不影响 AI 文字识别</Text>
            </Stack>
            <Switch 
              checked={grayscale} 
              onChange={(event) => setGrayscale(event.currentTarget.checked)} 
              size="md"
              color="teal"
            />
          </Group>
        </Stack>
      </Paper>

      <div className="compressor-simple-action">
        <Button
          size="lg"
          radius="xl"
          className="btn-primary btn-primary-mantine compressor-start-btn"
          disabled={!canStart}
          onClick={handleCompress}
          leftSection={<IconPlayerPlayFilled size={16} />}
        >
          {isRunning ? '正在压缩...' : '开始压缩'}
        </Button>
      </div>

      <ProgressPanel progress={progress} eyebrow="PDF 压缩" title="压缩进度" maxLogs={3} />

      {result && summary ? (
        <section className="panel-block compressor-result-card">
          <div className="compressor-result-header">
            <Badge variant="light" color="teal" radius="xl" size="lg">压缩完成</Badge>
            <h3 className="compressor-result-title">{result.fileName}</h3>
          </div>

          <div className="summary-strip compressor-summary-strip">
            <div className="summary-chip">
              <strong>原始大小</strong>
              <span>{summary.originalSize}</span>
            </div>
            <div className="summary-chip">
              <strong>压缩后</strong>
              <span>{summary.compressedSize}</span>
            </div>
            <div className="summary-chip">
              <strong>节省</strong>
              <span>{summary.savedBytes}</span>
            </div>
            <div className="summary-chip">
              <strong>压缩率</strong>
              <span>{summary.reduction}</span>
            </div>
            <div className="summary-chip">
              <strong>Base64字符 前</strong>
              <span>{summary.originalBase64Characters}</span>
            </div>
            <div className="summary-chip">
              <strong>Base64 Token 前</strong>
              <span>{summary.originalBase64Tokens}</span>
            </div>
            <div className="summary-chip">
              <strong>Base64字符 后</strong>
              <span>{summary.compressedBase64Characters}</span>
            </div>
            <div className="summary-chip">
              <strong>Base64 Token 后</strong>
              <span>{summary.compressedBase64Tokens}</span>
            </div>
          </div>

          <Button
            component="a"
            href={result.downloadUrl}
            download={`${result.fileName.replace(/\.pdf$/i, '')}_compressed.pdf`}
            size="xl"
            radius="xl"
            className="btn-primary btn-primary-mantine compressor-download-large"
            leftSection={<IconDownload size={18} />}
          >
            下载压缩后的 PDF
          </Button>
        </section>
      ) : null}
    </section>
  );
}
