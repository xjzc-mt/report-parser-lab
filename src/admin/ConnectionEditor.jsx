import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput
} from '@mantine/core';
import { IconRefresh, IconTrash } from '@tabler/icons-react';

import { adminApi } from './adminApi.js';
import { notifyPlatformConfigChanged } from '../utils/platformConfigBroadcast.js';

const TRANSPORT_OPTIONS = [
  { value: 'gemini_native', label: 'Gemini 原生' },
  { value: 'anthropic_native', label: 'Anthropic 原生' },
  { value: 'openai_compatible', label: 'OpenAI 兼容（OneAPI / DeepSeek / GLM）' }
];

const VENDOR_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'OpenAI',
  oneapi: 'OneAPI',
  mio: 'MIO-妙盈',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  custom: '自定义'
};

const VENDOR_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'mio', label: 'MIO-妙盈' },
  { value: 'custom', label: '自定义' }
];

const DEFAULT_CAPABILITIES = {
  supportsPdfUpload: false,
  supportsJsonMode: true,
  supportsVision: false,
  supportsStreaming: false
};

function createModelRow(model = {}) {
  return {
    name: String(model.name || ''),
    enabled: model.enabled === undefined ? true : Boolean(model.enabled),
    maxTokens: Number(model.maxTokens || 8192),
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...(model.capabilities || {})
    },
    requestOptions: model.requestOptions || {}
  };
}

function createForm(connection) {
  return {
    name: String(connection?.name || ''),
    transportType: connection?.transportType || 'openai_compatible',
    vendorKey: connection?.vendorKey || 'openai',
    baseUrl: String(connection?.baseUrl || (connection ? '' : 'https://api.openai.com/v1')),
    enabled: connection?.enabled === undefined ? true : Boolean(connection.enabled),
    apiKey: '',
    clearApiKey: false,
    models: (connection?.models || []).map(createModelRow),
    requestOptionsText: JSON.stringify(connection?.requestOptions || {}, null, 2)
  };
}

function parseRequestOptions(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('高级请求参数必须是 JSON 对象。');
  }
  return parsed;
}

export function ConnectionEditor({ opened, connection, onClose, onSaved }) {
  const isEditing = Boolean(connection?.id);
  const [form, setForm] = useState(() => createForm(connection));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeOpened, setProbeOpened] = useState(false);
  const [probeModels, setProbeModels] = useState([]);
  const [probeSelected, setProbeSelected] = useState([]);
  const [probeError, setProbeError] = useState('');

  useEffect(() => {
    if (opened) {
      setForm(createForm(connection));
      setError('');
      setSaving(false);
      setProbeError('');
      setProbeModels([]);
      setProbeSelected([]);
      setProbeOpened(false);
    }
  }, [connection, opened]);

  const supportsPdfForTransport = form.transportType === 'gemini_native';
  const vendorOptions = useMemo(() => {
    const options = [...VENDOR_OPTIONS];
    if (form.vendorKey && !options.some((option) => option.value === form.vendorKey)) {
      options.push({
        value: form.vendorKey,
        label: VENDOR_LABELS[form.vendorKey] || form.vendorKey
      });
    }
    return options;
  }, [form.vendorKey]);

  const modelOptions = useMemo(() => {
    const names = new Set(probeModels);
    for (const model of form.models) {
      if (model.name) names.add(model.name);
    }
    return Array.from(names).map((name) => ({ value: name, label: name }));
  }, [form.models, probeModels]);
  const keyHint = useMemo(() => {
    if (isEditing && connection?.keyConfigured) {
      return '已配置 Key；留空表示保留现有 Key，勾选“清除 Key”才会删除。';
    }
    return '公司 Key 只保存在服务端，不会返回浏览器。';
  }, [connection?.keyConfigured, isEditing]);

  const updateModel = (index, updater) => {
    setForm((previous) => ({
      ...previous,
      models: previous.models.map((model, modelIndex) => (
        modelIndex === index ? updater(model) : model
      ))
    }));
  };

  const updateField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const updateModelField = (index, key, value) => {
    updateModel(index, (previous) => ({ ...previous, [key]: value }));
  };

  const updateModelCapability = (index, key, value) => {
    updateModel(index, (previous) => ({
      ...previous,
      capabilities: {
        ...previous.capabilities,
        [key]: value
      }
    }));
  };

  const handleTransportChange = (value) => {
    const transportType = value || 'openai_compatible';
    setForm((previous) => ({
      ...previous,
      transportType,
      models: previous.models.map((model) => ({
        ...model,
        capabilities: {
          ...model.capabilities,
          supportsPdfUpload: transportType === 'gemini_native'
            ? model.capabilities.supportsPdfUpload
            : false
        }
      }))
    }));
  };

  const handleProbeModels = async () => {
    setProbeError('');
    if (!connection?.id) {
      setProbeError('请先保存连接，再重新打开此连接执行 Ping 模型。');
      return;
    }
    setProbeLoading(true);
    try {
      const result = await adminApi.probeModels(connection.id);
      const upstreamModels = Array.isArray(result?.models) ? result.models : [];
      const merged = Array.from(new Set([
        ...upstreamModels,
        ...form.models.map((model) => model.name).filter(Boolean)
      ]));
      if (merged.length === 0) {
        setProbeError('上游没有返回可用模型，请检查服务地址和 Key。');
        return;
      }
      setProbeModels(merged);
      setProbeSelected(form.models.map((model) => model.name).filter((name) => merged.includes(name)));
      setProbeOpened(true);
    } catch (probeFailure) {
      setProbeError(probeFailure instanceof Error ? probeFailure.message : 'Ping 模型失败。');
    } finally {
      setProbeLoading(false);
    }
  };

  const toggleProbeModel = (name) => {
    setProbeSelected((previous) => (
      previous.includes(name)
        ? previous.filter((item) => item !== name)
        : [...previous, name]
    ));
  };

  const applyProbeSelection = () => {
    const selected = new Set(probeSelected);
    const nextModels = probeModels
      .filter((name) => selected.has(name))
      .map((name) => form.models.find((model) => model.name === name) || createModelRow({
        name,
        maxTokens: 8192,
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: supportsPdfForTransport,
          supportsStreaming: true
        }
      }));
    setForm((previous) => ({ ...previous, models: nextModels }));
    setProbeOpened(false);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('请填写连接名称。');
      return;
    }
    if (!form.baseUrl.trim()) {
      setError('请填写公司模型连接地址。');
      return;
    }
    const models = form.models
      .map((model) => ({ ...model, name: model.name.trim() }))
      .filter((model) => model.name);

    let requestOptions;
    try {
      requestOptions = parseRequestOptions(form.requestOptionsText);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '高级请求参数格式不正确。');
      return;
    }

    const payload = {
      name: form.name.trim(),
      transportType: form.transportType,
      vendorKey: form.vendorKey,
      baseUrl: form.baseUrl.trim(),
      enabled: form.enabled,
      clearApiKey: form.clearApiKey,
      models: models.map((model) => ({
        name: model.name,
        enabled: model.enabled,
        maxTokens: Number(model.maxTokens) || 8192,
        capabilities: model.capabilities,
        requestOptions: model.requestOptions || {}
      })),
      requestOptions
    };
    if (form.apiKey.trim()) {
      payload.apiKey = form.apiKey.trim();
    }

    setSaving(true);
    try {
      const result = isEditing
        ? await adminApi.updateConnection(connection.id, payload)
        : await adminApi.createConnection(payload);
      onSaved?.(result.connection);
      notifyPlatformConfigChanged('connections-updated');
      onClose?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? '编辑公司连接' : '新增公司连接'}
      centered
      size="xl"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
    >
      <Stack gap="md">
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}

        <Text size="sm" c="dimmed">
          这里维护的地址、Key 和模型只保存在服务端。页面只能获取连接名称、模型名称和能力标签。
        </Text>

        <TextInput
          label="连接名称"
          placeholder="例如：公司 One-API"
          value={form.name}
          onChange={(event) => updateField('name', event.currentTarget.value)}
          required
        />

        <Select
          label="传输协议"
          data={TRANSPORT_OPTIONS}
          value={form.transportType}
          onChange={handleTransportChange}
          allowDeselect={false}
        />

        <Select
          label="厂商来源"
          data={vendorOptions}
          value={form.vendorKey}
          onChange={(value) => setForm((previous) => ({ ...previous, vendorKey: value || 'custom' }))}
          allowDeselect={false}
        />

        <TextInput
          label="服务地址"
          placeholder="https://one-api.example.com/v1"
          value={form.baseUrl}
          onChange={(event) => updateField('baseUrl', event.currentTarget.value)}
          required
        />

        <TextInput
          label={isEditing ? '更新 API Key' : 'API Key'}
          placeholder={isEditing && connection?.keyConfigured ? '留空保持现有 Key' : '请输入公司 API Key'}
          type="password"
          value={form.apiKey}
          onChange={(event) => updateField('apiKey', event.currentTarget.value)}
          description={keyHint}
        />

        {isEditing && connection?.keyConfigured ? (
          <Checkbox
            label="清除服务端已保存的 Key"
            checked={form.clearApiKey}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setForm((previous) => ({
                ...previous,
                clearApiKey: checked,
                apiKey: checked ? '' : previous.apiKey
              }));
            }}
          />
        ) : null}

        <Switch
          label="启用该连接"
          description="关闭后，前台不能再用该连接发起公司模型请求。"
          checked={form.enabled}
          onChange={(event) => updateField('enabled', event.currentTarget.checked)}
        />

        <Divider label="可用模型" labelPosition="left" />

        <Text size="xs" c="dimmed">
          PDF 直传需要上游模型确实支持 PDF 文件输入。使用 OpenAI 兼容服务时，请确认上游支持附件格式后再为对应模型开启；未开启时 PDF 会自动提取文本。
        </Text>

        <Group justify="space-between" align="center">
          <div>
            <Text size="sm" fw={600}>从上游 Ping 后选择开放模型</Text>
            <Text size="xs" c="dimmed">
              新增连接请先保存，再重新打开执行 Ping；模型名从上游列表选择，不手动填写。
            </Text>
          </div>
          <Button
            size="xs"
            radius="xl"
            variant="light"
            leftSection={<IconRefresh size={14} />}
            loading={probeLoading}
            disabled={!isEditing}
            onClick={handleProbeModels}
          >
            Ping 模型
          </Button>
        </Group>

        {probeError ? <Alert color="red" variant="light">{probeError}</Alert> : null}

        <Stack gap="sm">
          {form.models.length === 0 ? (
            <Text size="sm" c="dimmed">
              尚未开放模型。保存连接后点击“Ping 模型”，勾选要开放的模型。
            </Text>
          ) : null}

          {form.models.map((model, index) => (
            <div className="admin-model-row" key={`model-${index}`}>
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <Select
                  label={`模型 ${index + 1}`}
                  placeholder="从 Ping 结果中选择"
                  data={modelOptions}
                  value={model.name || null}
                  searchable
                  allowDeselect={false}
                  onChange={(value) => updateModel(index, (previous) => ({
                    ...previous,
                    name: value || ''
                  }))}
                  style={{ flex: 1 }}
                />
                <NumberInput
                  label="最大输出"
                  value={model.maxTokens}
                  min={1}
                  max={32768}
                  step={256}
                  onChange={(value) => updateModel(index, (previous) => ({
                    ...previous,
                    maxTokens: Number(value) || 8192
                  }))}
                  style={{ width: 130 }}
                />
                <ActionIcon
                  color="red"
                  variant="subtle"
                  aria-label="移除模型"
                  onClick={() => setForm((previous) => ({
                    ...previous,
                    models: previous.models.filter((_, modelIndex) => modelIndex !== index)
                  }))}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Group gap="md" mt="xs">
                <Checkbox
                  label="启用"
                  checked={model.enabled}
                  onChange={(event) => updateModelField(index, 'enabled', event.currentTarget.checked)}
                />
                <Checkbox
                  label="JSON"
                  checked={Boolean(model.capabilities.supportsJsonMode)}
                  onChange={(event) => updateModelCapability(index, 'supportsJsonMode', event.currentTarget.checked)}
                />
                <Checkbox
                  label="PDF 直传"
                  checked={Boolean(model.capabilities.supportsPdfUpload)}
                  onChange={(event) => updateModelCapability(index, 'supportsPdfUpload', event.currentTarget.checked)}
                />
                <Checkbox
                  label="Vision"
                  checked={Boolean(model.capabilities.supportsVision)}
                  onChange={(event) => updateModelCapability(index, 'supportsVision', event.currentTarget.checked)}
                />
                <Checkbox
                  label="Streaming"
                  checked={Boolean(model.capabilities.supportsStreaming)}
                  onChange={(event) => updateModelCapability(index, 'supportsStreaming', event.currentTarget.checked)}
                />
              </Group>
            </div>
          ))}
        </Stack>

        <Modal
          opened={probeOpened}
          onClose={() => setProbeOpened(false)}
          title="选择开放模型"
          centered
          size="lg"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              上游返回 {probeModels.length} 个模型。勾选需要开放的模型，确认后会替换当前连接的模型列表。
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" radius="xl" onClick={() => setProbeSelected([...probeModels])}>
                全选
              </Button>
              <Button size="xs" variant="default" radius="xl" onClick={() => setProbeSelected([])}>
                清空
              </Button>
            </Group>
            <ScrollArea h={340} type="auto">
              <Stack gap="xs" pr="xs">
                {probeModels.map((name) => {
                  const existing = form.models.some((model) => model.name === name);
                  return (
                    <Checkbox
                      key={name}
                      checked={probeSelected.includes(name)}
                      onChange={() => toggleProbeModel(name)}
                      label={(
                        <Group gap="xs">
                          <span>{name}</span>
                          {existing ? <Badge size="xs" variant="light" color="blue">当前已开放</Badge> : null}
                        </Group>
                      )}
                    />
                  );
                })}
              </Stack>
            </ScrollArea>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setProbeOpened(false)}>取消</Button>
              <Button onClick={applyProbeSelection}>应用选择（{probeSelected.length}）</Button>
            </Group>
          </Stack>
        </Modal>

        <Textarea
          label="连接级高级请求参数 JSON"
          description="会合并到实际请求体，用于 thinking / reasoning / max_tokens 等厂商扩展字段。不要在这里填写 Key、URL 或 model。"
          value={form.requestOptionsText}
          autosize
          minRows={4}
          maxRows={10}
          onChange={(event) => updateField('requestOptionsText', event.currentTarget.value)}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSave} loading={saving}>保存连接</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
