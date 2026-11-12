import { useEffect, useMemo, useState } from 'react';
import { Select, Stack } from '@mantine/core';

import { buildPresetSelectOptions } from '../../utils/modelPresetPresentation.js';
import {
  getPresetProviderId,
  groupPresetsByProvider
} from '../../utils/modelPresetGroups.js';

export function ProviderModelPicker({
  presets = [],
  value = '',
  onChange,
  requiredCapabilities = {},
  disabled = false,
  providerLabel = '供应商来源',
  modelLabel = '模型',
  size = 'sm'
}) {
  const groups = useMemo(() => groupPresetsByProvider(presets), [presets]);
  const currentPreset = useMemo(
    () => presets.find((preset) => preset.id === value) || null,
    [presets, value]
  );
  const [providerId, setProviderId] = useState(() => (
    currentPreset ? getPresetProviderId(currentPreset) : ''
  ));

  useEffect(() => {
    if (currentPreset) {
      setProviderId(getPresetProviderId(currentPreset));
      return;
    }
    const matchedGroup = groups.find((group) => group.presets.some((preset) => preset.id === value));
    if (matchedGroup) {
      setProviderId(matchedGroup.id);
    }
  }, [currentPreset, groups, value]);

  const activeGroup = groups.find((group) => group.id === providerId) || null;
  const providerOptions = groups.map((group) => ({
    value: group.id,
    label: group.label
  }));
  const modelOptions = useMemo(() => {
    if (!activeGroup) {
      return [];
    }
    return buildPresetSelectOptions(activeGroup.presets, requiredCapabilities).map((option) => ({
      value: option.value,
      label: option.preset.modelName || option.preset.name,
      disabled: option.disabled,
      description: option.description
    }));
  }, [activeGroup, requiredCapabilities]);

  const currentInGroup = Boolean(
    activeGroup && activeGroup.presets.some((preset) => preset.id === value)
  );

  return (
    <Stack gap="xs">
      <Select
        label={providerLabel}
        placeholder="选择供应商"
        data={providerOptions}
        value={providerId || null}
        onChange={(nextValue) => setProviderId(nextValue || '')}
        allowDeselect={false}
        disabled={disabled}
        size={size}
        comboboxProps={{ withinPortal: false }}
      />
      <Select
        label={modelLabel}
        placeholder={activeGroup ? '选择模型' : '先选择供应商'}
        data={modelOptions}
        value={currentInGroup ? value : null}
        onChange={(nextValue) => {
          if (nextValue) {
            onChange?.(nextValue);
          }
        }}
        allowDeselect={false}
        disabled={disabled || !activeGroup}
        size={size}
        searchable={modelOptions.length > 8}
        comboboxProps={{ withinPortal: false }}
      />
    </Stack>
  );
}
