import { Button, Group, Popover, Stack, Text } from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { formatPresetSummary } from '../../utils/modelPresetPresentation.js';
import { ProviderModelPicker } from './ProviderModelPicker.jsx';
import { getPresetCapabilityError, resolveRuntimeLlmConfig } from '../../services/modelPresetResolver.js';

export function PagePresetQuickSwitch({
  presets = [],
  preset = null,
  value = '',
  requiredCapabilities = {},
  onChange,
  onOpenModelPresetManager,
  disabled = false
}) {
  const runtimeConfig = preset
    ? resolveRuntimeLlmConfig(preset)
    : (value ? { staleSelection: true } : null);
  const summary = formatPresetSummary(preset, runtimeConfig);
  const capabilityError = getPresetCapabilityError(preset, requiredCapabilities);

  return (
    <Popover width={320} position="bottom-end" withArrow shadow="md" withinPortal={false}>
      <Popover.Target>
        <Button
          variant="subtle"
          size="compact-sm"
          radius="xl"
          className="page-preset-quick-trigger"
          leftSection={<IconAdjustmentsHorizontal size={14} stroke={1.8} />}
          disabled={disabled}
        >
          <span className="page-preset-quick-trigger-label">{summary.title}</span>
        </Button>
      </Popover.Target>

      <Popover.Dropdown className="page-preset-quick-popover">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={700}>当前模型</Text>
            <Text size="xs" c="dimmed">先选供应商来源，再选模型。</Text>
          </div>

          <div className="page-preset-quick-current">
            <strong>{summary.title}</strong>
            <Text size="xs" c={capabilityError ? 'red.4' : 'dimmed'}>
              {capabilityError || summary.meta}
            </Text>
          </div>

          <ProviderModelPicker
            presets={presets}
            value={value || preset?.id || ''}
            onChange={onChange}
            requiredCapabilities={requiredCapabilities}
            disabled={disabled}
            providerLabel="供应商来源"
            modelLabel="模型"
          />

          <Group gap="xs" justify="flex-end">
            {onOpenModelPresetManager ? (
              <Button
                size="xs"
                radius="xl"
                variant="light"
                onClick={onOpenModelPresetManager}
                disabled={disabled}
              >
                配置模型
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
