import { Button, Drawer, NumberInput, Text, Textarea } from '@mantine/core';

export function OptimizationStrategyDrawer({
  opened,
  onClose,
  strategy,
  onStrategyChange,
  onReset,
  onSave
}) {
  const updateField = (key, value) => {
    onStrategyChange?.((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      padding="lg"
      title="优化策略"
    >
      <div className="prompt-optimization-strategy-shell">
        <div className="prompt-optimization-strategy-head">
          <Text size="sm" fw={700}>全局共享优化流程</Text>
          <div className="prompt-optimization-strategy-actions">
            <Button variant="default" radius="xl" onClick={onReset}>
              恢复默认模板
            </Button>
            <Button radius="xl" onClick={onSave}>
              保存策略
            </Button>
          </div>
        </div>

        <div className="prompt-optimization-strategy-grid">
          <NumberInput
            label="训练样本数"
            min={1}
            max={8}
            value={strategy.trainingLimit}
            onChange={(value) => updateField('trainingLimit', Number(value || 1))}
          />
          <NumberInput
            label="验证样本数"
            min={1}
            max={6}
            value={strategy.validationLimit}
            onChange={(value) => updateField('validationLimit', Number(value || 1))}
          />
          <NumberInput
            label="页码扩窗"
            min={0}
            max={3}
            value={strategy.windowRadius}
            onChange={(value) => updateField('windowRadius', Number(value || 0))}
          />
        </div>

        <div className="prompt-optimization-strategy-section">
          <h4>诊断阶段</h4>
          <Textarea
            label="诊断系统提示词"
            autosize
            minRows={4}
            maxRows={10}
            value={strategy.diagnosisSystemPrompt}
            onChange={(event) => updateField('diagnosisSystemPrompt', event.currentTarget.value)}
          />
          <Textarea
            label="诊断用户模板"
            autosize
            minRows={10}
            maxRows={22}
            value={strategy.diagnosisUserTemplate}
            onChange={(event) => updateField('diagnosisUserTemplate', event.currentTarget.value)}
          />
        </div>

        <div className="prompt-optimization-strategy-section">
          <h4>候选生成阶段</h4>
          <Textarea
            label="生成系统提示词"
            autosize
            minRows={4}
            maxRows={10}
            value={strategy.candidateSystemPrompt}
            onChange={(event) => updateField('candidateSystemPrompt', event.currentTarget.value)}
          />
          <Textarea
            label="生成用户模板"
            autosize
            minRows={10}
            maxRows={22}
            value={strategy.candidateUserTemplate}
            onChange={(event) => updateField('candidateUserTemplate', event.currentTarget.value)}
          />
        </div>

        <div className="prompt-optimization-strategy-section">
          <h4>验证评审阶段</h4>
          <Textarea
            label="评审系统提示词"
            autosize
            minRows={4}
            maxRows={10}
            value={strategy.validationSystemPrompt}
            onChange={(event) => updateField('validationSystemPrompt', event.currentTarget.value)}
          />
          <Textarea
            label="评审用户模板"
            autosize
            minRows={10}
            maxRows={22}
            value={strategy.validationUserTemplate}
            onChange={(event) => updateField('validationUserTemplate', event.currentTarget.value)}
          />
        </div>
      </div>
    </Drawer>
  );
}
