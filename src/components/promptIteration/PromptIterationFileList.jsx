import { useRef, useState } from 'react';
import { ActionIcon, Badge, Button, TextInput, Tooltip } from '@mantine/core';
import { IconHelpCircle, IconTrash, IconUpload } from '@tabler/icons-react';
import { parsePromptIterationPageSpec } from '../../utils/promptIterationModel.js';

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
    type: file.type || 'application/pdf',
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

function isPdfFile(file) {
  return file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');
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

    const invalidFile = nextFiles.find((file) => !isPdfFile(file));
    if (invalidFile) {
      window.alert(`仅支持上传 PDF 文件：${invalidFile.name}`);
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
            type: file.type || 'application/pdf',
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
          <span className="prompt-iteration-side-title">文件与页码</span>
          <Badge variant="light" color="blue" radius="xl">
            {draft.files.length} 份 PDF
          </Badge>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
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
          添加 PDF
        </Button>
      </div>

      {draft.files.length === 0 ? (
        <div className="prompt-iteration-empty prompt-iteration-empty--compact">
          添加 PDF 后，可为每个文件单独设置页码范围。
        </div>
      ) : (
        <div className="prompt-iteration-file-list">
          {draft.files.map((item) => {
            const pageResult = parsePromptIterationPageSpec(item.pageSpec);
            const attached = hasAttachedFile(item);

            return (
              <div key={item.id} className="prompt-iteration-file-row">
                <div className="prompt-iteration-file-topline">
                  <span className="prompt-iteration-file-name" title={item.name || '未命名 PDF'}>
                    {item.name || '未命名 PDF'}
                  </span>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
