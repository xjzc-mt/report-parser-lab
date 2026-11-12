import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Drawer, Group, Menu, Modal, ScrollArea, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import {
  IconChevronDown,
  IconDownload,
  IconFileImport,
  IconHistory,
  IconPlus,
  IconRefresh,
  IconRotateClockwise2,
  IconSearch,
  IconTrash
} from '@tabler/icons-react';
import {
  buildPromptAssetExportSheets,
  clearPromptAssetLibrary,
  deletePromptAssetVersion,
  rollbackPromptAssetToVersion,
  savePromptAssetVersion
} from '../../services/promptAssetLibraryService.js';
import { PROCESSABLE_VALUE_TYPES } from '../../constants/extraction.js';
import { getStandardSystemPromptForValueType } from '../../services/llmClient.js';

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function summarizeImportResult(summary) {
  if (!summary) {
    return '';
  }

  return `新增 ${summary.createdCount || 0} 条，更新 ${summary.updatedCount || 0} 条，跳过 ${summary.skippedCount || 0} 条，无效 ${summary.invalidCount || 0} 条。`;
}

export function PromptAssetLibraryDrawer({
  opened,
  onClose,
  entries = [],
  isImporting = false,
  importSummary = null,
  onImportFile,
  onRefresh
}) {
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [busyVersionId, setBusyVersionId] = useState('');
  const [valueTypeFilter, setValueTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [newAssetCode, setNewAssetCode] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState('文字型');
  const [newAssetUserPrompt, setNewAssetUserPrompt] = useState('');
  const [newAssetSystemPrompt, setNewAssetSystemPrompt] = useState(() => getStandardSystemPromptForValueType('文字型'));
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const inputRef = useRef(null);

  const handleOpenCreateModal = () => {
    setNewAssetCode('');
    setNewAssetName('');
    setNewAssetType('文字型');
    setNewAssetUserPrompt('');
    setNewAssetSystemPrompt(getStandardSystemPromptForValueType('文字型'));
    setCreateModalOpened(true);
  };

  const handleSaveNewAsset = async () => {
    if (!newAssetCode.trim() || !newAssetName.trim() || !newAssetUserPrompt.trim()) {
      window.alert('请完整填写指标编码、指标名称和用户提示词');
      return;
    }
    try {
      setIsCreatingAsset(true);
      const result = await savePromptAssetVersion({
        indicatorCode: newAssetCode.trim(),
        indicatorName: newAssetName.trim(),
        valueType: newAssetType,
        userPromptTemplate: newAssetUserPrompt.trim(),
        systemPrompt: newAssetSystemPrompt.trim(),
        label: '手动新增',
        sourceType: 'manual'
      });
      setCreateModalOpened(false);
      await onRefresh?.();
      if (result.asset?.id) {
        setSelectedAssetId(result.asset.id);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingAsset(false);
    }
  };

  const handleClearLibrary = async () => {
    const confirmed = window.confirm(`确定要清空 Prompt 资产库吗？此操作将永久删除全部 ${entries.length} 个指标及其历史版本，不可撤销。`);
    if (!confirmed) {
      return;
    }
    try {
      setIsClearing(true);
      await clearPromptAssetLibrary();
      setSelectedAssetId('');
      await onRefresh?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClearing(false);
    }
  };

  const valueTypeOptions = useMemo(() => {
    const types = Array.from(new Set(entries.map((entry) => entry.asset.valueType || '未分类')));
    return [
      { value: 'all', label: `全部类型（${entries.length}）` },
      ...types.sort((left, right) => left.localeCompare(right)).map((type) => ({
        value: type,
        label: `${type}（${entries.filter((entry) => (entry.asset.valueType || '未分类') === type).length}）`
      }))
    ];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let list = valueTypeFilter === 'all'
      ? entries
      : entries.filter((entry) => (entry.asset.valueType || '未分类') === valueTypeFilter);

    if (searchQuery.trim()) {
      const term = searchQuery.trim().toLowerCase();
      list = list.filter((entry) => {
        const code = String(entry.asset?.indicatorCode || '').toLowerCase();
        const name = String(entry.asset?.indicatorName || entry.asset?.name || '').toLowerCase();
        return code.includes(term) || name.includes(term);
      });
    }

    return list;
  }, [entries, valueTypeFilter, searchQuery]);

  useEffect(() => {
    if (!filteredEntries.length) {
      setSelectedAssetId('');
      return;
    }

    setSelectedAssetId((previous) => (
      filteredEntries.some((entry) => entry.asset.id === previous)
        ? previous
        : filteredEntries[0].asset.id
    ));
  }, [filteredEntries]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.asset.id === selectedAssetId) || filteredEntries[0] || null,
    [filteredEntries, selectedAssetId]
  );

  const handleExport = async (entry = null, mode = 'latest') => {
    const targetEntries = entry ? [entry] : entries;
    if (!targetEntries.length) {
      return;
    }

    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheets = buildPromptAssetExportSheets(targetEntries, { mode });
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    Object.entries(sheets).forEach(([sheetName, rows]) => {
      const worksheet = XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : []);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    });

    const scope = entry?.asset?.indicatorCode || 'all';
    const modeLabel = mode === 'latest' ? 'latest' : 'full';
    XLSX.writeFile(workbook, `prompt_assets_${modeLabel}_${scope}_${timestamp}.xlsx`);
  };

  const handleRollback = async (assetId, versionId) => {
    try {
      setBusyVersionId(versionId);
      await rollbackPromptAssetToVersion({ assetId, versionId });
      await onRefresh?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyVersionId('');
    }
  };

  const handleDeleteVersion = async (assetId, versionId) => {
    try {
      setBusyVersionId(versionId);
      await deletePromptAssetVersion({ assetId, versionId });
      await onRefresh?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyVersionId('');
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Prompt 资产库"
      position="right"
      size="xl"
      padding="lg"
    >
      <div className="prompt-asset-library-shell">
        <section className="prompt-asset-library-import">
          <div>
            <Text size="sm" fw={700}>批量导入原始 Prompt</Text>
            <Text size="xs" c="dimmed">
              支持 `value_type / indicator_code / indicator_name / system_prompt / user_prompt`，其中 `prompt` 也会兼容为用户提示词；也可直接导入本页导出的资产库文件。
            </Text>
          </div>
          <div className="prompt-asset-library-import-actions">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportFile?.(file);
                }
                event.target.value = '';
              }}
            />
            <Button
              radius="xl"
              leftSection={<IconFileImport size={16} />}
              loading={isImporting}
              onClick={() => inputRef.current?.click()}
            >
              导入 Prompt 文件
            </Button>
            <Button
              variant="default"
              radius="xl"
              leftSection={<IconRefresh size={16} />}
              onClick={() => onRefresh?.()}
              disabled={isImporting}
            >
              刷新
            </Button>
            <Menu shadow="md" width={220} radius="md" position="bottom-end">
              <Menu.Target>
                <Button
                  variant="default"
                  radius="xl"
                  leftSection={<IconDownload size={16} />}
                  rightSection={<IconChevronDown size={14} />}
                  disabled={isImporting || entries.length === 0}
                >
                  导出资产库
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconDownload size={14} />}
                  onClick={() => handleExport(null, 'latest')}
                >
                  <div>
                    <Text size="sm" fw={600}>导出最新版本（推荐）</Text>
                    <Text size="xs" c="dimmed">仅包含当前生效的基线 Prompt</Text>
                  </div>
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconHistory size={14} />}
                  onClick={() => handleExport(null, 'all')}
                >
                  <div>
                    <Text size="sm" fw={600}>导出全部历史版本</Text>
                    <Text size="xs" c="dimmed">包含所有版本的变更记录</Text>
                  </div>
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              variant="subtle"
              color="red"
              radius="xl"
              leftSection={<IconTrash size={16} />}
              onClick={handleClearLibrary}
              loading={isClearing}
              disabled={isImporting || entries.length === 0}
            >
              清空资产库
            </Button>
          </div>
          {importSummary ? (
            <div className="prompt-asset-library-summary">
              <Badge variant="light" color="blue" radius="xl">最近导入</Badge>
              <span>{summarizeImportResult(importSummary)}</span>
            </div>
          ) : null}
        </section>

        <div className="prompt-asset-library-layout">
          <aside className="prompt-asset-library-list">
            <div className="prompt-asset-library-list-head">
              <Text size="sm" fw={700}>Prompt 资产</Text>
              <Group gap="xs">
                <Badge variant="light" color="gray" radius="xl">{filteredEntries.length} 条</Badge>
                <Button
                  size="xs"
                  variant="light"
                  radius="xl"
                  leftSection={<IconPlus size={12} />}
                  onClick={handleOpenCreateModal}
                >
                  新增指标
                </Button>
              </Group>
            </div>
            <Select
              size="xs"
              data={valueTypeOptions}
              value={valueTypeFilter}
              onChange={(value) => setValueTypeFilter(value || 'all')}
              allowDeselect={false}
              mb="xs"
            />
            <TextInput
              size="xs"
              placeholder="搜索指标代码或名称..."
              leftSection={<IconSearch size={14} />}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              clearable
              mb="xs"
            />
            {filteredEntries.length === 0 ? (
              <div className="prompt-asset-library-empty">
                {searchQuery.trim()
                  ? '未找到匹配的 Prompt 资产。'
                  : (entries.length === 0 ? '还没有导入任何 Prompt。先上传一份维护文件。' : '当前类型下没有 Prompt 资产。')}
              </div>
            ) : (
              <ScrollArea.Autosize mah={520}>
                <div className="prompt-asset-library-list-items">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.asset.id}
                      type="button"
                      className={`prompt-asset-library-item ${entry.asset.id === selectedEntry?.asset.id ? 'active' : ''}`}
                      onClick={() => setSelectedAssetId(entry.asset.id)}
                    >
                      <strong>{entry.asset.indicatorCode || '未编码指标'}</strong>
                      <span>{entry.asset.indicatorName || entry.asset.name || '未命名 Prompt'}</span>
                      <small>{entry.latestVersion?.label || '暂无版本'}</small>
                    </button>
                  ))}
                </div>
              </ScrollArea.Autosize>
            )}
          </aside>

          <section className="prompt-asset-library-detail">
            {!selectedEntry ? (
              <div className="prompt-asset-library-empty">
                选择左侧一条 Prompt 资产，查看当前基线和版本历史。
              </div>
            ) : (
              <>
                <div className="prompt-asset-library-detail-head">
                  <div>
                    <h3>{selectedEntry.asset.indicatorName || selectedEntry.asset.name || '未命名 Prompt'}</h3>
                    <p className="section-caption">
                      指标编码：{selectedEntry.asset.indicatorCode || '-'} · 类型：{selectedEntry.asset.valueType || '未分类'} · 最新更新：{formatDateTime(selectedEntry.asset.updatedAt)}
                    </p>
                  </div>
                  <div className="prompt-asset-library-detail-actions">
                    <div className="prompt-optimization-badge-row">
                      <Badge variant="light" color="blue" radius="xl">
                        最新版本 {selectedEntry.latestVersion?.label || '-'}
                      </Badge>
                      <Badge variant="light" color="gray" radius="xl">
                        历史 {selectedEntry.versions.length} 条
                      </Badge>
                    </div>
                    <Menu shadow="md" width={180} radius="md" position="bottom-end">
                      <Menu.Target>
                        <Button
                          variant="default"
                          radius="xl"
                          size="xs"
                          leftSection={<IconDownload size={14} />}
                          rightSection={<IconChevronDown size={12} />}
                        >
                          导出当前资产
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => handleExport(selectedEntry, 'latest')}>
                          仅导出最新版本
                        </Menu.Item>
                        <Menu.Item onClick={() => handleExport(selectedEntry, 'all')}>
                          导出全部历史版本
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                </div>

                <div className="prompt-asset-library-prompt-blocks">
                  <div className="prompt-asset-library-prompt-card">
                    <h4>系统提示词</h4>
                    <pre>{selectedEntry.latestVersion?.systemPrompt || '未配置系统提示词'}</pre>
                  </div>
                  <div className="prompt-asset-library-prompt-card">
                    <h4>用户提示词</h4>
                    <pre>{selectedEntry.latestVersion?.userPromptTemplate || '未配置用户提示词'}</pre>
                  </div>
                </div>

                <div className="prompt-asset-library-versions">
                  <h4>版本历史</h4>
                  <div className="prompt-asset-library-version-list">
                    {selectedEntry.versions.map((version) => (
                      <article key={version.id} className="prompt-asset-library-version-card">
                        <div className="prompt-asset-library-version-head">
                          <strong>{version.label || '未命名版本'}</strong>
                          <span>{formatDateTime(version.createdAt)}</span>
                        </div>
                        <div className="prompt-optimization-badge-row">
                          <Badge variant="light" color="blue" radius="xl">{version.sourceType || 'manual'}</Badge>
                          {selectedEntry.asset.latestVersionId === version.id ? (
                            <Badge variant="light" color="teal" radius="xl">当前基线</Badge>
                          ) : null}
                        </div>
                        <p className="section-caption">{version.notes || '无附加说明'}</p>
                        <div className="prompt-asset-library-version-actions">
                          {selectedEntry.asset.latestVersionId !== version.id ? (
                            <Button
                              variant="default"
                              radius="xl"
                              size="xs"
                              leftSection={<IconRotateClockwise2 size={14} />}
                              loading={busyVersionId === version.id}
                              onClick={() => handleRollback(selectedEntry.asset.id, version.id)}
                            >
                              设为当前基线
                            </Button>
                          ) : null}
                          {selectedEntry.asset.latestVersionId !== version.id ? (
                            <Button
                              variant="subtle"
                              color="red"
                              radius="xl"
                              size="xs"
                              leftSection={<IconTrash size={14} />}
                              loading={busyVersionId === version.id}
                              onClick={() => handleDeleteVersion(selectedEntry.asset.id, version.id)}
                            >
                              删除历史版本
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="新增 Prompt 资产"
        centered
        size="lg"
      >
        <Stack gap="sm">
          <TextInput
            label="指标编码"
            placeholder="例如：001001001"
            value={newAssetCode}
            onChange={(e) => setNewAssetCode(e.currentTarget.value)}
            required
          />
          <TextInput
            label="指标名称"
            placeholder="例如：温室气体排放总量"
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.currentTarget.value)}
            required
          />
          <Select
            label="指标类型"
            data={PROCESSABLE_VALUE_TYPES}
            value={newAssetType}
            onChange={(val) => {
              const nextType = val || '文字型';
              setNewAssetType(nextType);
              setNewAssetSystemPrompt(getStandardSystemPromptForValueType(nextType));
            }}
            allowDeselect={false}
            required
          />
          <Textarea
            label="用户提示词 (User Prompt)"
            placeholder="例如：请从报告中提取温室气体排放总量的具体数值与披露..."
            minRows={3}
            autosize
            value={newAssetUserPrompt}
            onChange={(e) => setNewAssetUserPrompt(e.currentTarget.value)}
            required
          />
          <Textarea
            label="系统提示词 (System Prompt)"
            placeholder="系统提示词模板..."
            minRows={4}
            maxRows={10}
            autosize
            value={newAssetSystemPrompt}
            onChange={(e) => setNewAssetSystemPrompt(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setCreateModalOpened(false)}>取消</Button>
            <Button
              onClick={handleSaveNewAsset}
              loading={isCreatingAsset}
              disabled={!newAssetCode.trim() || !newAssetName.trim() || !newAssetUserPrompt.trim()}
            >
              保存资产
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Drawer>
  );
}
