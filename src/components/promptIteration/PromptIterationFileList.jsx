import { useRef, useState } from 'react';
import { ActionIcon, Badge, Button, TextInput, Tooltip } from '@mantine/core';
import { IconHelpCircle, IconTrash, IconUpload } from '@tabler/icons-react';
import { detectPromptIterationFileKind, parsePromptIterationPageSpec } from '../../utils/promptIterationModel.js';

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function hasAttachedFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

function createDraftFileItem(file) {
  return {
    id: getFileIdentity(file),
    name: file.name,
    type: file.type || 'application/octet-stream',
    pageSpec: '',
    file
  };
}

function formatFileSize(size) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function getFileKindMeta(kind) {
  switch (kind) {
    case 'spreadsheet':
      return { label: '表格', color: 'cyan' };
    case 'text':
      return { label: '文本', color: 'grape' };
    case 'image':
      return { label: '图片', color: 'orange' };
    case 'pdf':
      return { label: 'PDF', color: 'blue' };
    default:
      return { label: '未知', color: 'gray' };
  }
}

function PageSpecHelp() {
  return (
    <Tooltip
      label="留空表示全文；支持单页、区间、多页组合，例如 12、12-15、12,18、12-15,18。"
      multiline
      w={260}
    >
      <IconHelpCircle size={15} stroke={1.8} className="prompt-iteration-page-help" />
    </Tooltip>
  );
}

export function PromptIterationFileList({ draft, onDraftChange, compact = false }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const appendFiles = (incomingFiles) => {
    const nextFiles = Array.isArray(incomingFiles) ? incomingFiles : [];
    if (nextFiles.length === 0) {
      return;
    }

    const invalidFile = nextFiles.find((file) => detectPromptIterationFileKind(file) === 'unsupported');
    if (invalidFile) {
      window.alert(`暂不支持该文件类型：${invalidFile.name}。当前支持 PDF、Excel/CSV 与常见文本文件。`);
      return;
    }

    onDraftChange((previous) => {
      const existing = [...previous.files];
      const seen = new Set(
        existing
          .filter((item) => hasAttachedFile(item))
          .map((item) => getFileIdentity(item.file))
      );

      nextFiles.forEach((file) => {
        const identity = getFileIdentity(file);
        if (seen.has(identity)) {
          return;
        }

        const placeholderIndex = existing.findIndex(
          (item) => !hasAttachedFile(item) && item.name === file.name
        );

        if (placeholderIndex >= 0) {
          existing[placeholderIndex] = {
            ...existing[placeholderIndex],
            id: identity,
            type: file.type || existing[placeholderIndex].type || 'application/octet-stream',
            file
          };
        } else {
          existing.push(createDraftFileItem(file));
        }

        seen.add(identity);
      });

      return {
        ...previous,
        files: existing
      };
    });
  };

  const removeFile = (fileId) => {
    onDraftChange((previous) => ({
      ...previous,
      files: previous.files.filter((item) => item.id !== fileId)
    }));
  };

  const updatePageSpec = (fileId, pageSpec) => {
    onDraftChange((previous) => ({
      ...previous,
      files: previous.files.map((item) => (
        item.id === fileId
          ? { ...item, pageSpec }
          : item
      ))
    }));
  };

  const normalizePageSpec = (item) => {
    const parsed = parsePromptIterationPageSpec(item.pageSpec);
    if (!parsed.valid || parsed.normalized === item.pageSpec) {
      return;
    }
    updatePageSpec(item.id, parsed.normalized);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    appendFiles(Array.from(event.dataTransfer.files || []));
  };

  return (
    <div
      className={`panel-block prompt-iteration-files ${compact ? 'prompt-iteration-files--compact' : ''} ${isDragging ? 'drag-active' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="prompt-iteration-files-toolbar">
        <div className="prompt-iteration-files-title">
          <span className="prompt-iteration-side-title">输入文件</span>
          <Badge variant="light" color="blue" radius="xl">
            {draft.files.length} 份文件
          </Badge>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,.docx,.txt,.md,.json,.yaml,.yml,.xml,.html,.htm,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp,text/plain,text/markdown,application/json,application/xml,text/xml,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          className="file-input"
          onChange={(event) => {
            appendFiles(Array.from(event.target.files || []));
            event.target.value = '';
          }}
        />
        <Button
          variant="default"
          size="xs"
          radius="xl"
          leftSection={<IconUpload size={14} />}
          onClick={() => inputRef.current?.click()}
        >
          添加文件
        </Button>
      </div>

      {draft.files.length === 0 ? (
        <div className="prompt-iteration-empty prompt-iteration-empty--compact">
          支持 PDF、Excel / CSV、DOCX、常见文本文件与图片；系统会自动识别类型，只有 PDF 会显示页码范围。
        </div>
      ) : (
        <div className="prompt-iteration-file-list">
          {draft.files.map((item) => {
            const pageResult = parsePromptIterationPageSpec(item.pageSpec);
            const attached = hasAttachedFile(item);
            const fileKind = detectPromptIterationFileKind(item);
            const fileKindMeta = getFileKindMeta(fileKind);

            return (
              <div key={item.id} className="prompt-iteration-file-row">
                <div className="prompt-iteration-file-topline">
                  <span className="prompt-iteration-file-name" title={item.name || '未命名文件'}>
                    {item.name || '未命名文件'}
                  </span>
                  <Badge
                    variant="light"
                    color={fileKindMeta.color}
                    radius="xl"
                    className="prompt-iteration-file-size"
                  >
                    {fileKindMeta.label}
                  </Badge>
                  <Badge
                    variant="light"
                    color={attached ? 'teal' : 'yellow'}
                    radius="xl"
                    className="prompt-iteration-file-size"
                  >
                    {attached ? formatFileSize(item.file.size) : '需重新上传'}
                  </Badge>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    radius="xl"
                    size="sm"
                    onClick={() => removeFile(item.id)}
                    aria-label={`删除 ${item.name}`}
                  >
                    <IconTrash size={15} stroke={1.8} />
                  </ActionIcon>
                </div>

                {fileKind === 'pdf' ? (
                  <TextInput
                    value={item.pageSpec}
                    placeholder="全文 / 12 / 12-15 / 12,18"
                    onChange={(event) => updatePageSpec(item.id, event.currentTarget.value)}
                    onBlur={() => normalizePageSpec(item)}
                    error={pageResult.valid ? undefined : pageResult.error}
                    description={
                      pageResult.valid && item.pageSpec.trim()
                        ? `解析后页码：${pageResult.normalized || '全文'}`
                        : undefined
                    }
                    rightSection={<PageSpecHelp />}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
