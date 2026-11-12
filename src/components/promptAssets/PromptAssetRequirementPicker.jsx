import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text
} from '@mantine/core';
import {
  backfillPromptAssetSystemPrompts,
  backfillPromptAssetValueTypes,
  listPromptAssetLibraryEntries
} from '../../services/promptAssetLibraryService.js';
import { buildRequirementsFromPromptAssets } from '../../services/promptAssetRequirementService.js';

export function PromptAssetRequirementPicker({
  opened,
  onClose,
  onConfirm,
  selectedAssetIds = []
}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [valueTypeFilter, setValueTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set(selectedAssetIds));

  useEffect(() => {
    if (!opened) return;
    setSelectedIds(new Set(selectedAssetIds));
    setError('');
    setLoading(true);
    Promise.all([
      backfillPromptAssetValueTypes(),
      backfillPromptAssetSystemPrompts()
    ])
      .then(() => listPromptAssetLibraryEntries())
      .then((nextEntries) => setEntries(nextEntries))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '读取 Prompt 资产库失败。'))
      .finally(() => setLoading(false));
  }, [opened, selectedAssetIds]);

  const valueTypeOptions = useMemo(() => {
    const types = Array.from(new Set(entries.map((entry) => entry.asset.valueType).filter(Boolean)));
    return [
      { value: 'all', label: '全部类型' },
      ...types.sort((left, right) => left.localeCompare(right)).map((type) => ({ value: type, label: type }))
    ];
  }, [entries]);

  const filteredEntries = useMemo(() => (
    valueTypeFilter === 'all'
      ? entries
      : entries.filter((entry) => entry.asset.valueType === valueTypeFilter)
  ), [entries, valueTypeFilter]);

  const validEntries = useMemo(
    () => filteredEntries.filter((entry) => (
      entry.asset.valueType
      && entry.latestVersion?.userPromptTemplate
    )),
    [filteredEntries]
  );

  const toggle = (id) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedEntries = entries.filter((entry) => selectedIds.has(entry.asset.id));
    const requirements = buildRequirementsFromPromptAssets(selectedEntries);
    if (requirements.length === 0) {
      setError('请至少选择一条有 value_type、指标编码和用户提示词的资产。');
      return;
    }
    onConfirm?.(requirements, selectedEntries);
    onClose?.();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="从 Prompt 资产库选择需求" centered size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          只会导入有 `value_type`、指标编码和用户提示词的资产；选中后直接用资产的 user_prompt / system_prompt 进入线上验证。
        </Text>
        {error ? <Alert color="red" variant="light">{error}</Alert> : null}
        <Group justify="space-between" align="center">
          <Select
            size="xs"
            data={valueTypeOptions}
            value={valueTypeFilter}
            onChange={(value) => setValueTypeFilter(value || 'all')}
            allowDeselect={false}
            w={180}
          />
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              radius="xl"
              onClick={() => setSelectedIds(new Set(validEntries.map((entry) => entry.asset.id)))}
              disabled={validEntries.length === 0}
            >
              全选当前类型
            </Button>
            <Button size="xs" variant="default" radius="xl" onClick={() => setSelectedIds(new Set())}>
              清空
            </Button>
          </Group>
        </Group>

        <ScrollArea.Autosize mah={460}>
          <Stack gap="xs">
            {loading ? <Text size="sm" c="dimmed">正在读取 Prompt 资产库...</Text> : null}
            {!loading && filteredEntries.length === 0 ? (
              <Text size="sm" c="dimmed">当前筛选下没有 Prompt 资产。</Text>
            ) : null}
            {filteredEntries.map((entry) => {
              const valid = Boolean(entry.asset.valueType && entry.latestVersion?.userPromptTemplate);
              return (
                <div className="prompt-asset-requirement-row" key={entry.asset.id}>
                  <Checkbox
                    checked={selectedIds.has(entry.asset.id)}
                    disabled={!valid}
                    onChange={() => toggle(entry.asset.id)}
                    label={(
                      <Group gap="xs">
                        <span>{entry.asset.indicatorCode || '未编码'}</span>
                        <span>{entry.asset.indicatorName || entry.asset.name || '未命名'}</span>
                        <Badge size="xs" variant="light" color={entry.asset.valueType ? 'blue' : 'gray'}>
                          {entry.asset.valueType || '未设置类型'}
                        </Badge>
                      </Group>
                    )}
                  />
                </div>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>应用为需求清单</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
