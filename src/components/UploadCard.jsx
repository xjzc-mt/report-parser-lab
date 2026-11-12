import { useRef, useState } from 'react';
import { ActionIcon, Badge, Button } from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';

export function UploadCard({
  icon,
  tag,
  title,
  hint,
  acceptHint,
  buttonLabel,
  accept,
  file,
  multiple = false,
  onFileSelect,
  onRemoveFile,
  formatFileInfo
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectedFiles = Array.isArray(file) ? file : (file ? [file] : []);

  const handleFile = (nextFile) => {
    if (!nextFile) return;
    onFileSelect(nextFile);
  };

  return (
    <div
      className={`upload-card ${isDragging ? 'drag-active' : ''}`}
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
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (multiple) {
          handleFile(Array.from(event.dataTransfer.files || []));
          return;
        }
        handleFile(event.dataTransfer.files?.[0] || null);
      }}
    >
      <div className="upload-card-head">
        <Badge variant="light" color="blue" radius="xl" className="upload-tag">
          {tag}
        </Badge>
        <div className="upload-icon">{icon}</div>
      </div>
      <div className="upload-copy">
        <h3>{title}</h3>
        <p className="upload-hint">{hint}</p>
        <p className="upload-accept-hint">{acceptHint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          handleFile(multiple ? files : (files[0] || null));
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="default"
        radius="xl"
        className="btn-outline"
        onClick={() => inputRef.current?.click()}
        leftSection={<IconUpload size={16} />}
      >
        {buttonLabel}
      </Button>
      <p className="upload-subhint">拖拽文件到这里，或点击按钮手动选择</p>
      {selectedFiles.length > 0 ? (
        <div className="file-info success">
          <div className="file-info-summary">✅ {formatFileInfo(multiple ? selectedFiles : selectedFiles[0])}</div>
          {multiple ? (
            <ul className="file-info-list">
              {selectedFiles.map((item) => (
                <li key={`${item.name}-${item.size}-${item.lastModified}`} className="file-info-item" title={item.name}>
                  <span className="file-info-name">{item.name}</span>
                  {onRemoveFile ? (
                    <ActionIcon
                      type="button"
                      variant="subtle"
                      color="red"
                      radius="xl"
                      size="sm"
                      className="file-remove-btn"
                      onClick={() => onRemoveFile(item)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <IconTrash size={14} stroke={1.8} />
                    </ActionIcon>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
