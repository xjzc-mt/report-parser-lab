import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Combobox,
  Input,
  InputBase,
  Modal,
  ScrollArea,
  Select,
  TextInput,
  Textarea,
  useCombobox
} from '@mantine/core';
import { IconArrowsMaximize, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { PROCESSABLE_VALUE_TYPES } from '../../constants/extraction.js';
import { getStandardSystemPromptForValueType, isStandardSystemPrompt } from '../../services/llmClient.js';
import {
  DRAFT_PROMPT_ASSET_OPTION_VALUE,
  buildPromptTextStats,
  detectPromptIterationFileKind
} from '../../utils/promptIterationModel.js';

function PromptAssetDropdownSelect({
  data = [],
  value = [],
  onChange,
  lockedValueType = '',
  activeAssetId = '',
  placeholder = '选择一个基线 Prompt（支持多选）',
  hasDraft = false,
  maxValues = 20
}) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch('');
    },
    onDropdownOpen: () => {
      combobox.focusSearchInput();
    }
  });

  const [search, setSearch] = useState('');

  const filteredOptions = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    const labelMatch = String(item.label || '').toLowerCase().includes(term);
    const codeMatch = String(item.indicatorCode || '').toLowerCase().includes(term);
    const nameMatch = String(item.indicatorName || '').toLowerCase().includes(term);
    const typeMatch = String(item.valueType || '').toLowerCase().includes(term);
    return labelMatch || codeMatch || nameMatch || typeMatch;
  });

  const handleToggle = (val) => {
    if (value.includes(val)) {
      onChange(value.filter((id) => id !== val));
    } else {
      if (value.length < maxValues) {
        onChange([...value, val]);
      }
    }
  };

  const handleClear = () => {
    if (value.length > 1) {
      // 多选合批状态下清空：默认回到用户提示词选中的这个指标（退回单选模式）
      const fallbackId = (activeAssetId && value.includes(activeAssetId))
        ? activeAssetId
        : value[0];
      onChange([fallbackId]);
    } else {
      // 已经是单选状态下清空：完全清空
      onChange([]);
    }
  };

  let displayText = '';
  if (value.length === 1) {
    const matched = data.find((item) => item.value === value[0]);
    displayText = matched ? matched.label : value[0];
  } else if (value.length > 1) {
    const typeLabel = lockedValueType ? `${lockedValueType} ` : '';
    displayText = `已选 ${value.length} 个${typeLabel}指标`;
  }

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(val) => {
        handleToggle(val);
      }}
      withinPortal={false}
    >
      <Combobox.Target>
        <InputBase
          label={
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Prompt 资产</span>
              {lockedValueType ? (
                <Badge size="xs" variant="light" color="blue" radius="sm" style={{ fontWeight: 500 }}>
                  {lockedValueType} · 已选 {value.length}/20
                </Badge>
              ) : null}
            </span>
          }
          component="button"
          type="button"
          pointer
          onClick={() => combobox.toggleDropdown()}
          rightSection={
            value.length > 0 ? (
              <CloseButton
                size="sm"
                variant="transparent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  handleClear();
                }}
                aria-label={value.length > 1 ? '退出合批多选并回到当前指标' : '清空选择'}
              />
            ) : (
              <Combobox.Chevron />
            )
          }
          rightSectionPointerEvents={value.length > 0 ? 'auto' : 'none'}
        >
          {displayText ? (
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
              textAlign: 'left'
            }}>
              {displayText}
            </span>
          ) : (
            <Input.Placeholder>{hasDraft ? '待写入 · 当前指标' : placeholder}</Input.Placeholder>
          )}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="搜索指标代码、名称或类型..."
        />
        <Combobox.Options>
          <ScrollArea.Autosize mah={280} type="scroll">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((item) => {
                const isChecked = value.includes(item.value);
                const isDisabled = Boolean(item.disabled || (!isChecked && value.length >= maxValues));
                return (
                  <Combobox.Option
                    value={item.value}
                    key={item.value}
                    disabled={isDisabled}
                    active={isChecked}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      opacity: isDisabled ? 0.45 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer'
                    }}>
                      <Checkbox
                        checked={isChecked}
                        onChange={() => {}}
                        aria-hidden
                        tabIndex={-1}
                        size="xs"
                        disabled={isDisabled}
                        style={{ pointerEvents: 'none' }}
                      />
                      <span style={{
                        fontSize: '0.85rem',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.label}
                      </span>
                    </div>
                  </Combobox.Option>
                );
              })
            ) : (
              <Combobox.Empty>没有匹配的 Prompt 资产</Combobox.Empty>
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  mio: 'MIO-妙盈',
  oneapi: 'OneAPI',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  anthropic: 'Anthropic',
  openai: 'OpenAI 兼容',
  company: '公司托管'
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
  filesPanel = null,
  selectedAssetIds = [],
  onSelectPromptAssets,
  lockedValueType = '',
  activeAssetId = '',
  onSelectActiveAsset,
  activeIndicatorName = '',
  selectedIndicatorsList = []
}) {
  const [createPromptMode, setCreatePromptMode] = useState(false);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const preCreateBackupRef = useRef(null);

  const updateField = (key, value) => {
    onDraftChange((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const providerLabel = PROVIDER_LABELS[llmSettings?.providerType] || '未选择模型';
  const promptStats = buildPromptTextStats({
    systemPrompt: draft.systemPrompt,
    userPrompt: draft.userPrompt
  });
  const editStats = buildPromptTextStats({
    [editingPrompt?.key || 'userPrompt']: editingValue
  });

  const effectiveSelectedIds = selectedAssetIds.length > 0
    ? selectedAssetIds
    : (selectedPromptAssetId ? [selectedPromptAssetId] : []);

  const hasDraftPromptAsset = Boolean(
    effectiveSelectedIds.length === 0 &&
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
    preCreateBackupRef.current = {
      draft: { ...draft },
      effectiveSelectedIds: [...effectiveSelectedIds],
      activeAssetId
    };
    setCreatePromptMode(true);
    const initialType = draft.promptValueType || '文字型';
    onSelectPromptAssets?.([]);
    onDraftChange((previous) => ({
      ...previous,
      promptAssetId: '',
      promptVersionId: '',
      activeAssetId: '',
      selectedPromptAssetIds: [],
      promptIndicatorCode: '',
      name: '',
      userPrompt: '',
      promptValueType: initialType,
      systemPrompt: (!previous.systemPrompt?.trim() || isStandardSystemPrompt(previous.systemPrompt))
        ? getStandardSystemPromptForValueType(initialType)
        : previous.systemPrompt
    }));
  };

  const handleCancelCreatePrompt = () => {
    setCreatePromptMode(false);
    if (preCreateBackupRef.current) {
      const backup = preCreateBackupRef.current;
      preCreateBackupRef.current = null;
      if (backup.effectiveSelectedIds && backup.effectiveSelectedIds.length > 0) {
        onSelectPromptAssets?.(backup.effectiveSelectedIds);
      }
      onDraftChange(() => backup.draft);
    }
  };

  const handleApplyCreatePrompt = () => {
    preCreateBackupRef.current = null;
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
                <PromptAssetDropdownSelect
                  data={promptAssetOptions}
                  value={effectiveSelectedIds}
                  onChange={(values) => onSelectPromptAssets ? onSelectPromptAssets(values) : onSelectPromptAsset?.(values[values.length - 1] || '')}
                  lockedValueType={lockedValueType}
                  activeAssetId={activeAssetId}
                  placeholder={promptAssetOptions.length ? '选择或搜索指标（支持多选）' : '暂无 Prompt 资产，可直接新增'}
                  hasDraft={hasDraftPromptAsset}
                  maxValues={20}
                />
                {effectiveSelectedIds.length <= 1 ? (
                  <Select
                    label="版本"
                    placeholder={hasDraftPromptAsset ? '写入后生成版本' : (promptVersionOptions.length ? '选择一个版本' : '先选择 Prompt 资产')}
                    data={promptVersionOptions}
                    value={selectedPromptVersionId || null}
                    onChange={(value) => value && onSelectPromptVersion?.(value)}
                    searchable
                    clearable={false}
                    disabled={effectiveSelectedIds.length === 0 || promptVersionOptions.length === 0}
                    nothingFoundMessage="没有可选版本"
                    comboboxProps={{ withinPortal: false }}
                  />
                ) : (
                  <TextInput
                    label="合批模式"
                    value="合批默认最新基线"
                    disabled
                  />
                )}
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
                <Select
                  label="指标类型"
                  data={PROCESSABLE_VALUE_TYPES}
                  value={draft.promptValueType || '文字型'}
                  onChange={(value) => {
                    const nextType = value || '文字型';
                    onDraftChange((previous) => ({
                      ...previous,
                      promptValueType: nextType,
                      systemPrompt: (!previous.systemPrompt?.trim() || isStandardSystemPrompt(previous.systemPrompt))
                        ? getStandardSystemPromptForValueType(nextType)
                        : previous.systemPrompt
                    }));
                  }}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: false }}
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
                      onClick={handleCancelCreatePrompt}
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
                ) : (effectiveSelectedIds.length > 0 || hasDraftPromptAsset) ? (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="prompt-iteration-field-label">用户提示词</span>
                {selectedIndicatorsList.length > 1 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>当前查看：</span>
                    <Select
                      size="xs"
                      radius="xl"
                      data={selectedIndicatorsList.map((item) => ({
                        value: item.id,
                        label: `${item.code ? `${item.code} · ` : ''}${item.name}`
                      }))}
                      value={activeAssetId}
                      onChange={(val) => val && onSelectActiveAsset?.(val)}
                      comboboxProps={{ withinPortal: false }}
                      styles={{ input: { height: 26, minHeight: 26, fontSize: '0.78rem', paddingLeft: 8, paddingRight: 22 } }}
                    />
                  </div>
                ) : null}
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
                color={llmSettings?.credentialsReady ? 'teal' : 'yellow'}
                radius="xl"
              >
                {llmSettings?.credentialsReady
                  ? (llmSettings?.serverManaged ? '公司托管' : 'Key 已配置')
                  : '凭据缺失'}
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
                <dd title={llmSettings?.serverManaged ? '由服务端公司连接配置' : (llmSettings?.apiUrl || '')}>
                  {llmSettings?.serverManaged ? '公司服务端托管' : (llmSettings?.apiUrl || '未配置')}
                </dd>
              </div>
              <div>
                <dt>文件处理</dt>
                <dd>顺序处理</dd>
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
