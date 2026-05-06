import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import { TRANSPORT_TYPES, VENDOR_KEYS } from '../../constants/modelPresets.js';

const TRANSPORT_OPTIONS = [
  { value: TRANSPORT_TYPES.GEMINI_NATIVE, label: 'Gemini 原生' },
  { value: TRANSPORT_TYPES.ANTHROPIC_NATIVE, label: 'Anthropic 原生' },
  { value: TRANSPORT_TYPES.OPENAI_COMPATIBLE, label: 'OpenAI 兼容' }
];

const VENDOR_OPTIONS = [
  { value: VENDOR_KEYS.GEMINI, label: 'Gemini' },
  { value: VENDOR_KEYS.CLAUDE, label: 'Claude' },
  { value: VENDOR_KEYS.OPENAI, label: 'OpenAI' },
  { value: VENDOR_KEYS.ONEAPI, label: 'OneAPI' },
  { value: VENDOR_KEYS.DEEPSEEK, label: 'DeepSeek' },
  { value: VENDOR_KEYS.GLM, label: 'GLM' },
  { value: VENDOR_KEYS.CUSTOM, label: '自定义' }
];

const VENDOR_DEFAULTS = {
  [VENDOR_KEYS.DEEPSEEK]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-pro',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: true
    }
  },
  [VENDOR_KEYS.GEMINI]: {
    transportType: TRANSPORT_TYPES.GEMINI_NATIVE,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelName: 'gemini-2.5-pro',
    capabilities: {
      supportsPdfUpload: true,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: false
    }
  },
  [VENDOR_KEYS.CLAUDE]: {
    transportType: TRANSPORT_TYPES.ANTHROPIC_NATIVE,
    baseUrl: 'https://api.anthropic.com',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: false
    }
  },
  [VENDOR_KEYS.OPENAI]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: 'https://api.openai.com/v1',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  },
  [VENDOR_KEYS.GLM]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4.7',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  }
};

function createPresetId() {
  return `preset_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function createEmptyPreset() {
  return {
    id: createPresetId(),
    name: '未命名预设',
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    vendorKey: VENDOR_KEYS.CUSTOM,
    baseUrl: '',
    modelName: '',
    credentialMode: 'manual',
    credentialRef: '',
    manualApiKey: '',
    requestOptions: {},
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: false
    },
    status: 'active',
    isReadonly: false,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function clonePreset(preset) {
  return {
    ...preset,
    capabilities: { ...(preset.capabilities || {}) },
    requestOptions: { ...(preset.requestOptions || {}) },
    id: createPresetId(),
    name: `${preset.name} - 副本`,
    credentialMode: 'manual',
    credentialRef: '',
    isReadonly: false,
    isDefault: false,
    updatedAt: Date.now()
  };
}

function formatRequestOptions(requestOptions) {
  const normalized = requestOptions && typeof requestOptions === 'object' && !Array.isArray(requestOptions)
    ? requestOptions
    : {};
  return JSON.stringify(normalized, null, 2);
}

function parseRequestOptions(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('高级参数必须是 JSON 对象');
  }
  return parsed;
}

export function ModelPresetManager({ presets = [], onChangePresets }) {
  const [selectedPresetId, setSelectedPresetId] = useState(() => presets[0]?.id || '');
  const [requestOptionsDraft, setRequestOptionsDraft] = useState('{}');
  const [requestOptionsError, setRequestOptionsError] = useState('');

  useEffect(() => {
    if (!presets.some((item) => item.id === selectedPresetId)) {
      setSelectedPresetId(presets[0]?.id || '');
    }
  }, [presets, selectedPresetId]);

  const selectedPreset = useMemo(
    () => presets.find((item) => item.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  );

  const selectedRequestOptionsText = useMemo(
    () => formatRequestOptions(selectedPreset?.requestOptions),
    [selectedPreset]
  );

  useEffect(() => {
    setRequestOptionsDraft(selectedRequestOptionsText);
    setRequestOptionsError('');
  }, [selectedPreset?.id, selectedRequestOptionsText]);

  const updatePreset = (updater) => {
    if (!selectedPreset) return;
    const nextPresets = presets.map((item) => (
      item.id === selectedPreset.id
        ? updater({ ...item, updatedAt: Date.now() })
        : item
    ));
    onChangePresets?.(nextPresets);
  };

  const applyRequestOptionsDraft = () => {
    if (!selectedPreset || selectedPreset.isReadonly) return;
    try {
      const parsed = parseRequestOptions(requestOptionsDraft);
      setRequestOptionsError('');
      updatePreset((item) => ({
        ...item,
        requestOptions: parsed
      }));
      setRequestOptionsDraft(formatRequestOptions(parsed));
    } catch (error) {
      setRequestOptionsError(error instanceof Error ? error.message : 'JSON 格式不正确');
    }
  };

  return (
    <div className="preset-manager-layout">
      <aside className="preset-manager-list">
        <div className="preset-manager-toolbar">
          <Button
            size="xs"
            radius="xl"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              const next = createEmptyPreset();
              onChangePresets?.([...presets, next]);
              setSelectedPresetId(next.id);
            }}
          >
            新增预设
          </Button>
        </div>

        <div className="preset-manager-list-items">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-list-item ${preset.id === selectedPresetId ? 'active' : ''}`}
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.vendorKey} · {preset.modelName || '未配置模型'}</span>
              <div className="preset-list-item-tags">
                {preset.isDefault ? <Badge size="xs" variant="light" color="blue">默认</Badge> : null}
                {preset.isReadonly ? <Badge size="xs" variant="light" color="gray">只读连接</Badge> : null}
                {preset.status === 'disabled' ? <Badge size="xs" variant="light" color="red">禁用</Badge> : null}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="preset-manager-editor">
        {!selectedPreset ? (
          <Text size="sm" c="dimmed">还没有可编辑的模型预设。</Text>
        ) : (
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <div>
                <h3 className="preset-manager-title">模型预设管理</h3>
                <Text size="sm" c="dimmed">
                  在这里统一维护模型连接、能力标签和显示名称；页面里只负责选用。
                </Text>
              </div>
              <Group gap="xs">
                <Button
                  size="xs"
                  radius="xl"
                  variant="default"
                  leftSection={<IconCopy size={14} />}
                  onClick={() => {
                    const copied = clonePreset(selectedPreset);
                    onChangePresets?.([...presets, copied]);
                    setSelectedPresetId(copied.id);
                  }}
                >
                  复制
                </Button>
                {!selectedPreset.isDefault ? (
                  <Button
                    size="xs"
                    radius="xl"
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => {
                      const nextPresets = presets.filter((item) => item.id !== selectedPreset.id);
                      onChangePresets?.(nextPresets);
                      setSelectedPresetId(nextPresets[0]?.id || '');
                    }}
                  >
                    删除
                  </Button>
                ) : null}
              </Group>
            </Group>

            <TextInput
              label="显示名称"
              value={selectedPreset.name}
              onChange={(event) => updatePreset((item) => ({ ...item, name: event.currentTarget.value }))}
            />

            <Select
              label="厂商来源"
              value={selectedPreset.vendorKey}
              data={VENDOR_OPTIONS}
              disabled={selectedPreset.isReadonly}
              allowDeselect={false}
              onChange={(value) => updatePreset((item) => {
                const vendorKey = value || VENDOR_KEYS.CUSTOM;
                const defaults = VENDOR_DEFAULTS[vendorKey] || {};
                return {
                  ...item,
                  vendorKey,
                  transportType: defaults.transportType || item.transportType,
                  baseUrl: item.baseUrl || defaults.baseUrl || '',
                  modelName: item.modelName || defaults.modelName || '',
                  capabilities: {
                    ...(item.capabilities || {}),
                    ...(defaults.capabilities || {})
                  }
                };
              })}
            />

            <Select
              label="传输协议"
              value={selectedPreset.transportType}
              data={TRANSPORT_OPTIONS}
              disabled={selectedPreset.isReadonly}
              allowDeselect={false}
              onChange={(value) => updatePreset((item) => ({ ...item, transportType: value || TRANSPORT_TYPES.OPENAI_COMPATIBLE }))}
            />

            <TextInput
              label="Base URL"
              value={selectedPreset.baseUrl || ''}
              disabled={selectedPreset.isReadonly}
              onChange={(event) => updatePreset((item) => ({ ...item, baseUrl: event.currentTarget.value }))}
            />

            <TextInput
              label="模型名称"
              value={selectedPreset.modelName || ''}
              disabled={selectedPreset.isReadonly}
              onChange={(event) => updatePreset((item) => ({ ...item, modelName: event.currentTarget.value }))}
            />

            {selectedPreset.credentialMode === 'manual' ? (
              <PasswordInput
                label="API Key"
                value={selectedPreset.manualApiKey || ''}
                onChange={(event) => updatePreset((item) => ({ ...item, manualApiKey: event.currentTarget.value }))}
              />
            ) : (
              <div className="preset-env-tip">
                <Text size="sm" fw={600}>此预设来自环境变量</Text>
                <Text size="xs" c="dimmed">
                  当前不会展示真实 Key，也不支持在页面里修改 env 中的密钥。
                </Text>
              </div>
            )}

            <Textarea
              label="高级请求参数 JSON"
              description="会合并到实际请求体，用于 reasoning/thinking、max_tokens、response_format、Gemini generationConfig 等厂商扩展字段。"
              value={requestOptionsDraft}
              autosize
              minRows={5}
              maxRows={10}
              disabled={selectedPreset.isReadonly}
              error={requestOptionsError}
              onChange={(event) => {
                setRequestOptionsDraft(event.currentTarget.value);
                if (requestOptionsError) setRequestOptionsError('');
              }}
              onBlur={applyRequestOptionsDraft}
            />

            <Switch
              label="启用该预设"
              checked={selectedPreset.status !== 'disabled'}
              onChange={(event) => updatePreset((item) => ({
                ...item,
                status: event.currentTarget.checked ? 'active' : 'disabled'
              }))}
            />

            <div className="preset-capability-grid">
              <Checkbox
                label="支持 PDF 直传"
                checked={Boolean(selectedPreset.capabilities?.supportsPdfUpload)}
                disabled={selectedPreset.isReadonly}
                onChange={(event) => updatePreset((item) => ({
                  ...item,
                  capabilities: {
                    ...item.capabilities,
                    supportsPdfUpload: event.currentTarget.checked
                  }
                }))}
              />
              <Checkbox
                label="支持 JSON"
                checked={Boolean(selectedPreset.capabilities?.supportsJsonMode)}
                disabled={selectedPreset.isReadonly}
                onChange={(event) => updatePreset((item) => ({
                  ...item,
                  capabilities: {
                    ...item.capabilities,
                    supportsJsonMode: event.currentTarget.checked
                  }
                }))}
              />
              <Checkbox
                label="支持 Vision"
                checked={Boolean(selectedPreset.capabilities?.supportsVision)}
                disabled={selectedPreset.isReadonly}
                onChange={(event) => updatePreset((item) => ({
                  ...item,
                  capabilities: {
                    ...item.capabilities,
                    supportsVision: event.currentTarget.checked
                  }
                }))}
              />
              <Checkbox
                label="支持 Streaming"
                checked={Boolean(selectedPreset.capabilities?.supportsStreaming)}
                disabled={selectedPreset.isReadonly}
                onChange={(event) => updatePreset((item) => ({
                  ...item,
                  capabilities: {
                    ...item.capabilities,
                    supportsStreaming: event.currentTarget.checked
                  }
                }))}
              />
            </div>
          </Stack>
        )}
      </section>
    </div>
  );
}
