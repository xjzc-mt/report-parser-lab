import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';

import {
  normalizePageConfig,
  PLATFORM_PAGE_DEFINITIONS
} from '../constants/platformPages.js';
import { adminApi } from './adminApi.js';
import { notifyPlatformConfigChanged } from '../utils/platformConfigBroadcast.js';

const PARENT_LABELS = {
  'test-workbench': '测试集工作台',
  'online-validation': '线上验证工作台',
  'data-prep': '数据预处理工作台',
  docs: '说明文档'
};

function clonePages(pages) {
  return normalizePageConfig(pages);
}

function renderDefaultField(field, value, onChange) {
  if (field.type === 'boolean') {
    return (
      <Switch
        key={field.key}
        label={field.label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select
        key={field.key}
        label={field.label}
        data={field.options.map((option) => ({ value: String(option), label: String(option) }))}
        value={value === undefined || value === null ? null : String(value)}
        onChange={(next) => onChange(Number(next))}
        allowDeselect={false}
        style={{ minWidth: 180 }}
      />
    );
  }

  return (
    <NumberInput
      key={field.key}
      label={field.label}
      value={value}
      min={field.min}
      max={field.max}
      step={field.step || 1}
      decimalScale={field.type === 'number' ? 2 : 0}
      onChange={(next) => onChange(typeof next === 'number' ? next : field.fallback)}
      style={{ minWidth: 200 }}
    />
  );
}

export function PageManagementPanel({ pages, onSaved }) {
  const [draft, setDraft] = useState(() => clonePages(pages));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    setDraft(clonePages(pages));
  }, [pages]);

  const groupedPages = useMemo(() => {
    const groups = new Map();
    for (const definition of PLATFORM_PAGE_DEFINITIONS) {
      if (!groups.has(definition.parent)) {
        groups.set(definition.parent, []);
      }
      groups.get(definition.parent).push(definition);
    }
    return Array.from(groups.entries());
  }, []);

  const updatePage = (pageKey, updater) => {
    setSavedMessage('');
    setDraft((previous) => ({
      ...previous,
      [pageKey]: updater(previous[pageKey])
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const result = await adminApi.updatePages(draft);
      const nextPages = normalizePageConfig(result.pages);
      setDraft(nextPages);
      setSavedMessage('页面配置已保存。前台会立即刷新开关；已启动任务按启动时配置完成。');
      onSaved?.(nextPages);
      notifyPlatformConfigChanged('pages-updated');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存页面配置失败。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>页面开关与默认参数</h2>
          <Text size="sm" c="dimmed">
            关闭页面后，前台隐藏对应入口并禁止启动新任务；已经启动的任务按启动时规则完成。默认参数只补充尚未配置的项，不覆盖用户已保存设置。
          </Text>
        </div>
        <Button
          size="sm"
          radius="xl"
          leftSection={<IconDeviceFloppy size={14} />}
          loading={saving}
          onClick={handleSave}
        >
          保存页面配置
        </Button>
      </div>

      {error ? <Alert color="red" variant="light" mb="md">{error}</Alert> : null}
      {savedMessage ? <Alert color="teal" variant="light" mb="md">{savedMessage}</Alert> : null}

      <Stack gap="lg">
        {groupedPages.map(([parent, definitions]) => (
          <div key={parent}>
            <Title order={3} className="admin-page-group-title">
              {PARENT_LABELS[parent] || parent}
            </Title>
            <Stack gap="sm">
              {definitions.map((definition) => {
                const page = draft[definition.key];
                return (
                  <div className="admin-page-config-card" key={definition.key}>
                    <div className="admin-page-config-heading">
                      <Group gap="xs" align="center">
                        <strong>{definition.label}</strong>
                        <Badge
                          variant="light"
                          color={page.enabled ? 'teal' : 'red'}
                          radius="xl"
                        >
                          {page.enabled ? '开放' : '已关闭'}
                        </Badge>
                      </Group>
                      <Switch
                        label="开放该页"
                        checked={page.enabled}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          updatePage(definition.key, (previous) => ({
                            ...previous,
                            enabled: checked
                          }));
                        }}
                      />
                    </div>

                    {definition.defaults.length === 0 ? (
                      <Text size="xs" c="dimmed" mt="xs">
                        该页没有可配置的运行参数；只受开放开关影响。
                      </Text>
                    ) : (
                      <Group gap="md" align="flex-end" mt="sm" wrap="wrap">
                        {definition.defaults.map((field) => (
                          <div key={`${definition.key}-${field.key}`}>
                            {renderDefaultField(field, page.defaults[field.key], (value) => (
                              updatePage(definition.key, (previous) => ({
                                ...previous,
                                defaults: {
                                  ...previous.defaults,
                                  [field.key]: value
                                }
                              }))
                            ))}
                          </div>
                        ))}
                      </Group>
                    )}
                  </div>
                );
              })}
            </Stack>
          </div>
        ))}
      </Stack>

      <div className="admin-note">
        <Text size="xs" c="dimmed">
          一级工作台的可见状态由其子页决定：测试集工作台的三个子页全部关闭时隐藏一级入口；数据预处理工作台同理。说明文档关闭后只隐藏入口，不影响管理员 /admin。
        </Text>
      </div>
    </section>
  );
}
