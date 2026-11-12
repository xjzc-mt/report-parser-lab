import { Modal, Stack, Text } from '@mantine/core';
import { ModelPresetManager } from './modelPresets/ModelPresetManager.jsx';

export function LLMSettingsDrawer({
  opened,
  onClose,
  presets,
  onChangePresets
}) {
  const personalPresets = presets.filter((preset) => preset.credentialMode !== 'company');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="模型配置"
      centered
      size="xl"
      styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          填接口地址和 API Key，Ping 出模型后选择一个即可保存为个人预设。
          页面按“供应商 → 模型”选择；公司托管模型由管理员在 /admin 统一维护，不在这里编辑。
        </Text>
        <ModelPresetManager presets={personalPresets} onChangePresets={onChangePresets} />
      </Stack>
    </Modal>
  );
}
