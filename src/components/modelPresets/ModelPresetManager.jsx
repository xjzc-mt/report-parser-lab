import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { IconCopy, IconKey, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { TRANSPORT_TYPES, VENDOR_KEYS } from '../../constants/modelPresets.js';
import { probePersonalModels } from '../../services/personalModelProbeService.js';

const VENDOR_LABELS = {
  [VENDOR_KEYS.MIO]: 'MIO-妙盈',
  [VENDOR_KEYS.OPENAI]: 'OpenAI 兼容',
  [VENDOR_KEYS.GEMINI]: 'Gemini',
  [VENDOR_KEYS.CLAUDE]: 'Anthropic',
  [VENDOR_KEYS.DEEPSEEK]: 'DeepSeek',
  [VENDOR_KEYS.GLM]: 'GLM',
  [VENDOR_KEYS.ONEAPI]: 'OneAPI',
  [VENDOR_KEYS.CUSTOM]: '自定义'
};

const VENDOR_OPTIONS = [
  { value: VENDOR_KEYS.OPENAI, label: VENDOR_LABELS[VENDOR_KEYS.OPENAI] },
  { value: VENDOR_KEYS.GEMINI, label: VENDOR_LABELS[VENDOR_KEYS.GEMINI] },
  { value: VENDOR_KEYS.CLAUDE, label: VENDOR_LABELS[VENDOR_KEYS.CLAUDE] },
  { value: VENDOR_KEYS.CUSTOM, label: VENDOR_LABELS[VENDOR_KEYS.CUSTOM] }
];

const VENDOR_DEFAULTS = {
  [VENDOR_KEYS.MIO]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: '',
    modelName: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  },
  [VENDOR_KEYS.OPENAI]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: 'https://api.openai.com/v1',
    modelName: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
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
    modelName: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: false
    }
  },
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
  },
  [VENDOR_KEYS.ONEAPI]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: '',
    modelName: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  },
  [VENDOR_KEYS.CUSTOM]: {
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    baseUrl: '',
    modelName: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: true
    }
  }
};

function createPresetId() {
  return `preset_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function getVendorLabel(vendorKey) {
  return VENDOR_LABELS[vendorKey] || vendorKey || '自定义';
}

function createEmptyPreset() {
  const defaults = VENDOR_DEFAULTS[VENDOR_KEYS.OPENAI];
  return {
    id: createPresetId(),
    name: '',
    transportType: defaults.transportType,
    vendorKey: VENDOR_KEYS.OPENAI,
    baseUrl: defaults.baseUrl,
    modelName: '',
    credentialMode: 'manual',
    credentialRef: '',
    manualApiKey: '',
    requestOptions: {},
    capabilities: { ...defaults.capabilities },
    status: 'active',
    isReadonly: false,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function clonePreset(preset) {
  const isCompany = preset.credentialMode === 'company';
  return {
    ...preset,
    capabilities: { ...(preset.capabilities || {}) },
    requestOptions: { ...(preset.requestOptions || {}) },
    id: createPresetId(),
    name: preset.name ? `${preset.name} - 副本` : '',
    transportType: isCompany ? (preset.companyTransportType || TRANSPORT_TYPES.OPENAI_COMPATIBLE) : preset.transportType,
    companyConnectionId: '',
    companyConnectionName: '',
    available: true,
    unavailableReason: '',
    status: 'active',
    credentialMode: 'manual',
    credentialRef: '',
    manualApiKey: '',
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

function autoPresetName(item, vendorKey, modelName) {
  const currentName = String(item.name || '').trim();
  if (currentName && currentName !== '未命名预设' && currentName !== '新模型配置') {
    return item.name;
  }
  if (modelName) {
    return `${getVendorLabel(vendorKey)} · ${modelName}`;
  }
  return getVendorLabel(vendorKey);
}

export function ModelPresetManager({ presets = [], onChangePresets }) {
  const [selectedPresetId, setSelectedPresetId] = useState(() => presets[0]?.id || '');
  const [draftPreset, setDraftPreset] = useState(null);
  const [requestOptionsDraft, setRequestOptionsDraft] = useState('{}');
  const [requestOptionsError, setRequestOptionsError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState('');

  useEffect(() => {
    if (draftPreset) {
      return;
    }
    if (!presets.some((item) => item.id === selectedPresetId)) {
      setSelectedPresetId(presets[0]?.id || '');
    }
  }, [draftPreset, presets, selectedPresetId]);

  const selectedPreset = useMemo(
    () => draftPreset || presets.find((item) => item.id === selectedPresetId) || null,
    [draftPreset, presets, selectedPresetId]
  );

  const selectedRequestOptionsText = useMemo(
    () => formatRequestOptions(selectedPreset?.requestOptions),
    [selectedPreset]
  );

  useEffect(() => {
    setRequestOptionsDraft(selectedRequestOptionsText);
    setRequestOptionsError('');
    setModelOptions(selectedPreset?.modelName ? [selectedPreset.modelName] : []);
    setProbeError('');
    setAdvancedOpen(false);
  }, [selectedPreset?.id, selectedRequestOptionsText]);

  const vendorOptions = useMemo(() => {
    const options = [...VENDOR_OPTIONS];
    if (selectedPreset?.vendorKey && !options.some((option) => option.value === selectedPreset.vendorKey)) {
      options.push({
        value: selectedPreset.vendorKey,
        label: getVendorLabel(selectedPreset.vendorKey)
      });
    }
    return options;
  }, [selectedPreset?.vendorKey]);

  const updatePreset = (updater) => {
    if (!selectedPreset) return;
    if (draftPreset && selectedPreset.id === draftPreset.id) {
      setDraftPreset((current) => (current ? updater({ ...current, updatedAt: Date.now() }) : current));
      return;
    }
    const nextPresets = presets.map((item) => (
      item.id === selectedPreset.id
        ? updater({ ...item, updatedAt: Date.now() })
        : item
    ));
    onChangePresets?.(nextPresets);
  };

  const updatePresetField = (key, value) => {
    updatePreset((item) => ({ ...item, [key]: value }));
  };

  const updatePresetCapability = (key, value) => {
    updatePreset((item) => ({
      ...item,
      capabilities: {
        ...item.capabilities,
        [key]: value
      }
    }));
  };

  const handleAddPreset = () => {
    if (draftPreset) {
      setSelectedPresetId(draftPreset.id);
      return;
    }
    const nextDraft = createEmptyPreset();
    setDraftPreset(nextDraft);
    setSelectedPresetId(nextDraft.id);
  };

  const handleSelectPreset = (presetId) => {
    if (presetId === selectedPresetId) {
      return;
    }
    if (draftPreset && presetId !== draftPreset.id) {
      const confirmed = window.confirm('新建的模型配置还没有保存，切换后会丢失。确定继续吗？');
      if (!confirmed) {
        return;
      }
      setDraftPreset(null);
    }
    setSelectedPresetId(presetId);
  };

  const handleSaveDraft = () => {
    if (!draftPreset) {
      return;
    }
    const name = String(draftPreset.name || '').trim()
      || autoPresetName(draftPreset, draftPreset.vendorKey, draftPreset.modelName);
    const nextPreset = { ...draftPreset, name, updatedAt: Date.now() };
    onChangePresets?.([...presets, nextPreset]);
    setDraftPreset(null);
    setSelectedPresetId(nextPreset.id);
  };

  const handleCancelDraft = () => {
    setDraftPreset(null);
    setSelectedPresetId(presets[0]?.id || '');
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

  const handleVendorChange = (value) => {
    const vendorKey = value || VENDOR_KEYS.CUSTOM;
    const defaults = VENDOR_DEFAULTS[vendorKey] || VENDOR_DEFAULTS[VENDOR_KEYS.CUSTOM];
    setModelOptions(defaults.modelName ? [defaults.modelName] : []);
    setProbeError('');
    updatePreset((item) => ({
      ...item,
      vendorKey,
      transportType: defaults.transportType || TRANSPORT_TYPES.OPENAI_COMPATIBLE,
      baseUrl: defaults.baseUrl || '',
      modelName: defaults.modelName || '',
      capabilities: { ...(defaults.capabilities || {}) },
      name: autoPresetName(item, vendorKey, defaults.modelName || '')
    }));
  };

  const handleModelChange = (value) => {
    const modelName = String(value || '').trim();
    updatePreset((item) => ({
      ...item,
      modelName,
      name: autoPresetName(item, item.vendorKey, modelName)
    }));
  };

  const handleProbeModels = async () => {
    if (!selectedPreset) return;
    setProbeError('');
    setProbeLoading(true);
    try {
      const models = await probePersonalModels({
        baseUrl: selectedPreset.baseUrl,
        apiKey: selectedPreset.manualApiKey,
        transportType: selectedPreset.transportType
      });
      setModelOptions(models);
      if (!models.includes(selectedPreset.modelName) && models.length === 1) {
        handleModelChange(models[0]);
      }
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : 'Ping 模型失败。');
    } finally {
      setProbeLoading(false);
    }
  };

  if (presets.length === 0 && !draftPreset) {
    return (
      <div className="preset-manager-empty">
        <span className="preset-manager-empty-icon">
          <IconKey size={20} stroke={1.8} />
        </span>
        <h3 className="preset-manager-empty-title">还没有个人模型配置</h3>
        <Text size="sm" c="dimmed" className="preset-manager-empty-copy">
          新增一个配置，填写接口地址和 API Key，Ping 出模型后保存即可使用。
        </Text>
        <Button radius="xl" leftSection={<IconPlus size={15} />} onClick={handleAddPreset}>
          新增模型配置
        </Button>
      </div>
    );
  }

  return (
    <div className="preset-manager-layout">
      <aside className="preset-manager-list">
        <div className="preset-manager-toolbar">
          <Button
            size="xs"
            radius="xl"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={handleAddPreset}
          >
            新增模型配置
          </Button>
        </div>

        <div className="preset-manager-list-items">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-list-item ${preset.id === selectedPresetId ? 'active' : ''}`}
              onClick={() => handleSelectPreset(preset.id)}
            >
              <strong>{preset.name || getVendorLabel(preset.vendorKey)}</strong>
              <span>{getVendorLabel(preset.vendorKey)} · {preset.modelName || '未选择模型'}</span>
              <div className="preset-list-item-tags">
                {preset.status === 'disabled' ? <Badge size="xs" variant="light" color="red">禁用</Badge> : null}
              </div>
            </button>
          ))}
          {presets.length === 0 ? (
            <div className="preset-manager-list-empty">新配置保存后会显示在这里</div>
          ) : null}
        </div>
      </aside>

      <section className="preset-manager-editor">
        {!selectedPreset ? (
          <Text size="sm" c="dimmed">还没有个人模型配置，点击“新增模型配置”开始。</Text>
        ) : (
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <div>
                <Group gap="xs" align="center">
                  <h3 className="preset-manager-title">{draftPreset ? '新建模型配置' : '个人模型配置'}</h3>
                  {draftPreset ? <Badge size="xs" variant="light" color="yellow">未保存</Badge> : null}
                </Group>
                <Text size="sm" c="dimmed">
                  {draftPreset
                    ? '填写完成后点击保存，保存后会出现在左侧列表。'
                    : '填接口地址和 Key，Ping 出模型后选择；修改会自动保存为预设。'}
                </Text>
              </div>
              {draftPreset ? (
                <Group gap="xs">
                  <Button
                    size="xs"
                    radius="xl"
                    variant="default"
                    onClick={handleCancelDraft}
                  >
                    取消
                  </Button>
                  <Button
                    size="xs"
                    radius="xl"
                    onClick={handleSaveDraft}
                  >
                    保存
                  </Button>
                </Group>
              ) : (
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
                  {!selectedPreset.isDefault && selectedPreset.credentialMode !== 'company' ? (
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
              )}
            </Group>

            <TextInput
              label="配置名称"
              placeholder="例如：OpenAI 兼容 · gpt-4.1"
              value={selectedPreset.name}
              disabled={selectedPreset.isReadonly}
              onChange={(event) => updatePresetField('name', event.currentTarget.value)}
            />

            <Select
              label="供应商"
              value={selectedPreset.vendorKey}
              data={vendorOptions}
              disabled={selectedPreset.isReadonly}
              allowDeselect={false}
              onChange={handleVendorChange}
            />

            <TextInput
              label="接口地址"
              placeholder="https://one-api.example.com/v1"
              value={selectedPreset.baseUrl || ''}
              disabled={selectedPreset.isReadonly}
              onChange={(event) => updatePresetField('baseUrl', event.currentTarget.value)}
            />

            <PasswordInput
              label="API Key"
              placeholder="只保存在当前浏览器"
              value={selectedPreset.manualApiKey || ''}
              disabled={selectedPreset.isReadonly}
              onChange={(event) => updatePresetField('manualApiKey', event.currentTarget.value)}
            />

            <div>
              <Group justify="space-between" align="center">
                <Text size="sm" fw={600}>模型</Text>
                <Button
                  size="xs"
                  radius="xl"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  loading={probeLoading}
                  disabled={selectedPreset.isReadonly}
                  onClick={handleProbeModels}
                >
                  Ping 模型
                </Button>
              </Group>
              <Autocomplete
                mt="xs"
                data={modelOptions}
                value={selectedPreset.modelName || ''}
                disabled={selectedPreset.isReadonly}
                placeholder="Ping 后选择，或直接输入模型名"
                maxDropdownHeight={240}
                onChange={handleModelChange}
              />
              <Text size="xs" c="dimmed" mt={6}>
                Ping 由浏览器直接请求模型服务；如果被跨域拦截，可以直接输入模型名。
              </Text>
              {probeError ? (
                <Alert color="red" variant="light" mt="xs">
                  {probeError}
                </Alert>
              ) : null}
            </div>

            <Button
              variant="subtle"
              size="xs"
              onClick={() => setAdvancedOpen((previous) => !previous)}
            >
              {advancedOpen ? '收起高级设置' : '高级设置（可选）'}
            </Button>

            <Collapse in={advancedOpen}>
              <Stack gap="sm">
              <Checkbox
                label="上游模型支持 PDF/图片直传"
                description="确认模型支持文件输入后再开启；关闭时 PDF 会自动提取文本，图片仍需要多模态直传。"
                checked={Boolean(selectedPreset.capabilities?.supportsPdfUpload)}
                disabled={selectedPreset.isReadonly}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  updatePresetCapability('supportsPdfUpload', checked);
                }}
              />
              <Textarea
                label="高级请求参数 JSON"
                description="用于 reasoning/thinking、max_tokens 等扩展字段；普通使用不需要填写。"
                value={requestOptionsDraft}
                autosize
                minRows={4}
                maxRows={10}
                disabled={selectedPreset.isReadonly}
                error={requestOptionsError}
                onChange={(event) => {
                  setRequestOptionsDraft(event.currentTarget.value);
                  if (requestOptionsError) setRequestOptionsError('');
                }}
                onBlur={applyRequestOptionsDraft}
              />
              </Stack>
            </Collapse>
          </Stack>
        )}
      </section>
    </div>
  );
}
