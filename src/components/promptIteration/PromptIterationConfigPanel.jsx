import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Modal, Select, TextInput, Textarea } from '@mantine/core';
import { IconArrowsMaximize, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import {
  DRAFT_PROMPT_ASSET_OPTION_VALUE,
  buildPromptTextStats,
  detectPromptIterationFileKind
} from '../../utils/promptIterationModel.js';

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  openai: 'OpenAI 兼容'
};

export function PromptIterationConfigPanel({
  draft,
  onDraftChange,
  llmSettings,
  presetName,
  requiresPdfUpload = false,
  supportsPdfUpload = false,
  promptAssetOptions = [],
  promptVersionOptions = [],
  selectedPromptAssetId = '',
  selectedPromptVersionId = '',
  onSelectPromptAsset,
  onSelectPromptVersion,
  onOpenPromptAssetLibrary,
  onSavePromptAsset,
  canSavePromptAsset = false,
  isSavingPromptAsset = false,
  filesPanel = null
}) {
  const [createPromptMode, setCreatePromptMode] = useState(false);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const updateField = (key, value) => {
    onDraftChange((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const providerLabel = PROVIDER_LABELS[llmSettings?.providerType] || '未识别 Provider';
  const promptStats = buildPromptTextStats({
    systemPrompt: draft.systemPrompt,
    userPrompt: draft.userPrompt
  });
  const editStats = buildPromptTextStats({
    [editingPrompt?.key || 'userPrompt']: editingValue
  });
  const hasDraftPromptAsset = Boolean(
    !selectedPromptAssetId &&
    draft.promptIndicatorCode?.trim() &&
    draft.name?.trim() &&
    !createPromptMode
  );
  const promptAssetValue = selectedPromptAssetId || (hasDraftPromptAsset ? DRAFT_PROMPT_ASSET_OPTION_VALUE : null);
  const fileKinds = new Set((draft.files || []).map((item) => detectPromptIterationFileKind(item)).filter((kind) => kind !== 'unsupported'));
  const inputModeLabel = fileKinds.size <= 1
    ? (
      fileKinds.has('pdf') ? 'PDF 输入'
        : fileKinds.has('spreadsheet') ? '表格输入'
          : fileKinds.has('text') ? '文本输入'
            : '等待上传'
    )
    : '混合输入';

  useEffect(() => {
    if (selectedPromptAssetId) {
      setCreatePromptMode(false);
    }
  }, [selectedPromptAssetId]);

  const openPromptEditor = (key, label) => {
    setEditingPrompt({ key, label });
    setEditingValue(String(draft[key] || ''));
  };

  const closePromptEditor = () => {
    setEditingPrompt(null);
    setEditingValue('');
  };

  const applyPromptEditor = () => {
    if (editingPrompt?.key) {
      updateField(editingPrompt.key, editingValue);
    }
    closePromptEditor();
  };

  const handleStartCreatePrompt = () => {
    setCreatePromptMode(true);
    onDraftChange((previous) => ({
      ...previous,
      promptAssetId: '',
      promptVersionId: ''
    }));
  };

  const handleApplyCreatePrompt = () => {
    setCreatePromptMode(false);
  };

  return (
    <div className="panel-block prompt-iteration-config">
      <div className="prompt-iteration-section-head">
        <div>
          <h3 className="prompt-iteration-section-title">实验配置</h3>
          <p className="section-caption">
            先定义这次要验证的提取目标，再直接观察同一套 Prompt 在不同文件上的稳定性。
          </p>
        </div>
      </div>

      <div className="prompt-iteration-config-layout">
        <div className="prompt-iteration-input-stack">
          <div className="prompt-iteration-prompt-source">
            {!createPromptMode ? (
              <div className="prompt-iteration-prompt-source-grid">
                <Select
                  label="Prompt 资产"
                  placeholder={promptAssetOptions.length ? '选择一个基线 Prompt' : '暂无 Prompt 资产，可直接新增'}
                  data={promptAssetOptions}
                  value={promptAssetValue}
                  onChange={(value) => {
                    if (value && value !== DRAFT_PROMPT_ASSET_OPTION_VALUE) {
                      onSelectPromptAsset?.(value);
                    }
                  }}
                  searchable
                  clearable={false}
                  nothingFoundMessage="没有可选 Prompt 资产"
                  comboboxProps={{ withinPortal: false }}
                />
                <Select
                  label="版本"
                  placeholder={hasDraftPromptAsset ? '写入后生成版本' : (promptVersionOptions.length ? '选择一个版本' : '先选择 Prompt 资产')}
                  data={promptVersionOptions}
                  value={selectedPromptVersionId || null}
                  onChange={(value) => value && onSelectPromptVersion?.(value)}
                  searchable
                  clearable={false}
                  disabled={!selectedPromptAssetId || promptVersionOptions.length === 0}
                  nothingFoundMessage="没有可选版本"
                  comboboxProps={{ withinPortal: false }}
                />
              </div>
            ) : (
              <div className="prompt-iteration-new-asset-grid">
                <TextInput
                  label="指标代码"
                  placeholder="例如：001001002"
                  value={draft.promptIndicatorCode}
                  onChange={(event) => updateField('promptIndicatorCode', event.currentTarget.value)}
                />
                <TextInput
                  label="指标名称"
                  placeholder="例如：环保创新技术"
                  value={draft.name}
                  onChange={(event) => updateField('name', event.currentTarget.value)}
                />
              </div>
            )}
            <div className="prompt-iteration-prompt-source-actions">
              <div className="prompt-iteration-prompt-source-actions-left">
                {!createPromptMode ? (
                  <Button variant="default" radius="xl" onClick={handleStartCreatePrompt}>
                    新增 Prompt
                  </Button>
                ) : null}
              </div>
              <div className="prompt-iteration-prompt-source-actions-right">
                {createPromptMode ? (
                  <>
                    <Button
                      variant="default"
                      radius="xl"
                      onClick={() => setCreatePromptMode(false)}
                      disabled={isSavingPromptAsset}
                    >
                      取消新增
                    </Button>
                    <Button
                      radius="xl"
                      onClick={handleApplyCreatePrompt}
                      disabled={!draft.promptIndicatorCode.trim() || !draft.name.trim()}
                    >
                      应用
                    </Button>
                  </>
                ) : (selectedPromptAssetId || hasDraftPromptAsset) ? (
                  <Button
                    radius="xl"
                    onClick={() => onSavePromptAsset?.()}
                    disabled={!canSavePromptAsset}
                    loading={isSavingPromptAsset}
                  >
                    写入新版本
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="prompt-iteration-field-card">
            <div className="prompt-iteration-system-prompt-head">
              <div>
                <span className="prompt-iteration-field-label">系统提示词</span>
                <span className="prompt-iteration-field-stats">
                  {promptStats.system.characters} 字符 · 约 {promptStats.system.estimatedTokens} tokens
                </span>
                {!systemPromptExpanded ? (
                  <p className="section-caption">
                    {draft.systemPrompt.trim()
                      ? `${draft.systemPrompt.trim().slice(0, 90)}${draft.systemPrompt.trim().length > 90 ? '...' : ''}`
                      : '未填写系统提示词'}
                  </p>
                ) : null}
              </div>
              <div className="prompt-iteration-inline-actions">
                {systemPromptExpanded ? (
                  <ActionIcon
                    variant="subtle"
                    radius="xl"
                    size="sm"
                    onClick={() => openPromptEditor('systemPrompt', '系统提示词')}
                    aria-label="放大编辑系统提示词"
                    title="放大"
                  >
                    <IconArrowsMaximize size={15} />
                  </ActionIcon>
                ) : null}
                <ActionIcon
                  variant="subtle"
                  radius="xl"
                  size="sm"
                  onClick={() => setSystemPromptExpanded((value) => !value)}
                  aria-label={systemPromptExpanded ? '收起系统提示词' : '展开系统提示词'}
                  title={systemPromptExpanded ? '收起' : '展开'}
                >
                  {systemPromptExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                </ActionIcon>
              </div>
            </div>
            {systemPromptExpanded ? (
              <Textarea
                placeholder="为模型定义角色、边界和输出要求"
                autosize
                minRows={5}
                maxRows={12}
                value={draft.systemPrompt}
                onChange={(event) => updateField('systemPrompt', event.currentTarget.value)}
              />
            ) : null}
          </div>

          <div className="prompt-iteration-field-card prompt-iteration-user-prompt">
            <div className="prompt-iteration-user-prompt-head">
              <div>
                <span className="prompt-iteration-field-label">用户提示词</span>
                <span className="prompt-iteration-field-stats">
                  {promptStats.user.characters} 字符 · 约 {promptStats.user.estimatedTokens} tokens
                </span>
              </div>
              <ActionIcon
                variant="subtle"
                radius="xl"
                size="sm"
                onClick={() => openPromptEditor('userPrompt', '用户提示词')}
                aria-label="放大编辑用户提示词"
                title="放大编辑"
              >
                <IconArrowsMaximize size={15} />
              </ActionIcon>
            </div>
            <Textarea
              placeholder="写明这次统一要抽取的内容或判断规则"
              autosize
              minRows={8}
              maxRows={18}
              value={draft.userPrompt}
              onChange={(event) => updateField('userPrompt', event.currentTarget.value)}
            />
          </div>
        </div>

        <aside className="prompt-iteration-sidebar">
          <div className="prompt-iteration-model-summary">
            <span className="prompt-iteration-side-title">模型</span>
            <strong className="prompt-iteration-model-name">
              {presetName || llmSettings?.modelName || '未配置模型'}
            </strong>
            <div className="prompt-iteration-model-badges">
              <Badge variant="light" color="blue" radius="xl">{providerLabel}</Badge>
              <Badge
                variant="light"
                color={llmSettings?.apiKey ? 'teal' : 'yellow'}
                radius="xl"
              >
                {llmSettings?.apiKey ? 'Key 已配置' : 'Key 缺失'}
              </Badge>
              <Badge
                variant="light"
                color={requiresPdfUpload ? (supportsPdfUpload ? 'teal' : 'red') : 'blue'}
                radius="xl"
              >
                {requiresPdfUpload ? (supportsPdfUpload ? '多模态直传' : '不支持多模态直传') : inputModeLabel}
              </Badge>
            </div>
            {requiresPdfUpload && !supportsPdfUpload ? (
              <p className="section-caption">
                当前文件列表中包含 PDF 或图片，请切换到支持多模态直传的模型预设。
              </p>
            ) : null}
            <dl className="prompt-iteration-model-meta">
              <div className="wide">
                <dt>接口地址</dt>
                <dd title={llmSettings?.apiUrl || ''}>{llmSettings?.apiUrl || '未配置'}</dd>
              </div>
              <div>
                <dt>并行批次</dt>
                <dd>{llmSettings?.parallelCount ?? '-'}</dd>
              </div>
              <div>
                <dt>最大重试</dt>
                <dd>{llmSettings?.maxRetries ?? '-'}</dd>
              </div>
            </dl>
          </div>

          {filesPanel ? (
            <div className="prompt-iteration-sidebar-files">
              {filesPanel}
            </div>
          ) : null}
        </aside>
      </div>

      <Modal
        opened={Boolean(editingPrompt)}
        onClose={closePromptEditor}
        title={editingPrompt?.label || '编辑提示词'}
        size="80%"
        centered
        classNames={{ content: 'prompt-editor-modal', header: 'prompt-editor-modal-header' }}
      >
        <div className="prompt-editor-modal-body">
          <div className="prompt-editor-modal-stats">
            <span>{editStats.total.characters} 字符</span>
            <span>约 {editStats.total.estimatedTokens} tokens</span>
          </div>
          <Textarea
            value={editingValue}
            onChange={(event) => setEditingValue(event.currentTarget.value)}
            minRows={20}
            autosize
            className="prompt-editor-modal-textarea"
          />
          <div className="prompt-editor-modal-actions">
            <Button variant="default" radius="xl" onClick={closePromptEditor}>
              取消
            </Button>
            <Button radius="xl" onClick={applyPromptEditor}>
              应用
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
