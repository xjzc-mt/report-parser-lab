import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Modal, NumberInput, Text, TextInput } from '@mantine/core';
import { buildPromptOptimizationIndicatorGroups } from '../../utils/promptOptimizationViewModel.js';

function normalizeIndicatorCode(value) {
  return String(value || '').trim();
}

function clampSimilarity(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, parsed));
}

function buildCodeList(groups = []) {
  return groups.flatMap((group) => group.items.map((item) => item.code));
}

export function OptimizationTargetPickerModal({
  opened,
  onClose,
  comparisonRows = [],
  defaultMinSimilarity = 0,
  defaultMaxSimilarity = 70,
  initialSelectedCodes = [],
  title = '选择要自动优化的指标',
  confirmLabel = '确认并进入自动优化',
  onConfirm
}) {
  const normalizedInitialCodes = useMemo(
    () => (Array.isArray(initialSelectedCodes) ? initialSelectedCodes : [])
      .map((value) => normalizeIndicatorCode(value))
      .filter(Boolean),
    [initialSelectedCodes]
  );
  const [minSimilarity, setMinSimilarity] = useState(defaultMinSimilarity);
  const [maxSimilarity, setMaxSimilarity] = useState(defaultMaxSimilarity);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [query, setQuery] = useState('');
  const [expandedTypes, setExpandedTypes] = useState([]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    setMinSimilarity(clampSimilarity(defaultMinSimilarity, 0));
    setMaxSimilarity(clampSimilarity(defaultMaxSimilarity, 100));
    setSelectedCodes(normalizedInitialCodes);
    setQuery('');
  }, [defaultMaxSimilarity, defaultMinSimilarity, normalizedInitialCodes, opened]);

  const effectiveMinSimilarity = Math.min(minSimilarity, maxSimilarity);
  const effectiveMaxSimilarity = Math.max(minSimilarity, maxSimilarity);

  const groups = useMemo(
    () => buildPromptOptimizationIndicatorGroups(comparisonRows, {
      minSimilarity: effectiveMinSimilarity,
      maxSimilarity: effectiveMaxSimilarity,
      query
    }),
    [comparisonRows, effectiveMaxSimilarity, effectiveMinSimilarity, query]
  );

  const visibleCodes = useMemo(
    () => buildCodeList(groups),
    [groups]
  );

  useEffect(() => {
    if (!opened) {
      return;
    }
    setExpandedTypes(query ? groups.map((group) => group.type) : []);
  }, [groups, opened, query]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    setSelectedCodes((current) => {
      const filteredCurrent = current.filter((code) => visibleCodes.includes(code));
      if (filteredCurrent.length > 0) {
        return filteredCurrent;
      }
      return normalizedInitialCodes.filter((code) => visibleCodes.includes(code));
    });
  }, [normalizedInitialCodes, opened, visibleCodes]);

  const toggleCode = (code) => {
    setSelectedCodes((current) => (
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    ));
  };

  const selectGroup = (codes) => {
    setSelectedCodes((current) => {
      const next = [...current];
      codes.forEach((code) => {
        if (!next.includes(code)) {
          next.push(code);
        }
      });
      return next;
    });
  };

  const clearGroup = (codes) => {
    setSelectedCodes((current) => current.filter((code) => !codes.includes(code)));
  };

  const toggleExpandedType = (type) => {
    setExpandedTypes((current) => (
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    ));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size="lg"
    >
      <div className="prompt-optimization-picker-shell">
        <div className="prompt-optimization-picker-range">
          <NumberInput
            label="最小相似度"
            min={0}
            max={100}
            value={minSimilarity}
            onChange={(value) => setMinSimilarity(clampSimilarity(value, 0))}
          />
          <NumberInput
            label="最大相似度"
            min={0}
            max={100}
            value={maxSimilarity}
            onChange={(value) => setMaxSimilarity(clampSimilarity(value, 100))}
          />
        </div>

        <TextInput
          label="搜索指标"
          placeholder="按指标编码或名称搜索"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />

        <div className="prompt-optimization-badge-row">
          <Badge size="sm" radius="xl" variant="light" color="blue">
            显示 {visibleCodes.length} 个指标
          </Badge>
          <Badge size="sm" radius="xl" variant="light" color="grape">
            已选 {selectedCodes.length} 个
          </Badge>
          <Badge size="sm" radius="xl" variant="light" color="teal">
            区间 {effectiveMinSimilarity} ~ {effectiveMaxSimilarity}
          </Badge>
        </div>

        {groups.length === 0 ? (
          <div className="prompt-optimization-empty">
            当前相似度区间内没有可选指标，请调整筛选范围。
          </div>
        ) : (
          <div className="prompt-optimization-target-groups">
            {groups.map((group) => {
              const groupCodes = group.items.map((item) => item.code);
              const selectedCount = groupCodes.filter((code) => selectedCodes.includes(code)).length;
              return (
                <section className="prompt-optimization-target-group" key={group.type}>
                  <div className="prompt-optimization-target-group-head">
                    <div>
                      <button
                        type="button"
                        className="prompt-optimization-group-toggle"
                        onClick={() => toggleExpandedType(group.type)}
                      >
                        <strong>{group.type}</strong>
                        <span>{expandedTypes.includes(group.type) ? '收起' : '展开'}</span>
                      </button>
                      <Text size="xs" c="dimmed">
                        {group.items.length} 个指标
                      </Text>
                    </div>
                    <div className="prompt-optimization-target-group-actions">
                      <Button variant="subtle" size="compact-sm" onClick={() => selectGroup(groupCodes)}>
                        全选
                      </Button>
                      <Button variant="subtle" size="compact-sm" onClick={() => clearGroup(groupCodes)} disabled={selectedCount === 0}>
                        清空
                      </Button>
                    </div>
                  </div>
                  {expandedTypes.includes(group.type) ? (
                    <div className="prompt-optimization-target-items prompt-optimization-target-items-scrollable">
                      {group.items.map((item) => (
                        <label className="prompt-optimization-target-item" key={item.code}>
                          <input
                            type="checkbox"
                            checked={selectedCodes.includes(item.code)}
                            onChange={() => toggleCode(item.code)}
                          />
                          <div className="prompt-optimization-target-item-copy">
                            <span>{item.label}</span>
                            <small>{item.rowCount} 条样本</small>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}

        <div className="prompt-optimization-target-picker-actions">
          <Button variant="default" radius="xl" onClick={onClose}>
            取消
          </Button>
          <Button
            radius="xl"
            disabled={selectedCodes.length === 0}
            onClick={() => onConfirm?.(selectedCodes)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
