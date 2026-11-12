import { useState } from 'react';
import { Alert, Badge, Button, Group, Text } from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconRefresh, IconSettings, IconTrash } from '@tabler/icons-react';

import { adminApi } from './adminApi.js';
import { ConnectionEditor } from './ConnectionEditor.jsx';
import { notifyPlatformConfigChanged } from '../utils/platformConfigBroadcast.js';

function transportLabel(value) {
  if (value === 'gemini_native') return 'Gemini 原生';
  if (value === 'anthropic_native') return 'Anthropic 原生';
  return 'OpenAI 兼容';
}

export function CompanyConnectionsPanel({ connections = [], onChanged }) {
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);

  const openCreate = () => {
    setEditingConnection(null);
    setEditorOpened(true);
  };

  const openEdit = (connection) => {
    setEditingConnection(connection);
    setEditorOpened(true);
  };

  const handleDelete = async (connection) => {
    if (!window.confirm(`确认删除公司连接“${connection.name}”？删除后前台不能再使用该连接。`)) {
      return;
    }
    setBusyId(connection.id);
    setError('');
    try {
      await adminApi.deleteConnection(connection.id);
      notifyPlatformConfigChanged('connections-updated');
      await onChanged?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除连接失败。');
    } finally {
      setBusyId('');
    }
  };

  const handleTest = async (connection) => {
    setBusyId(connection.id);
    setError('');
    setTestResult(null);
    try {
      const result = await adminApi.testConnection(connection.id);
      setTestResult(result);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : '连接测试失败。');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>公司模型连接</h2>
          <Text size="sm" c="dimmed">
            维护服务端地址、Key 和允许模型。公司 Key 不会返回浏览器；个人预设仍由用户在模型预设中自行维护。
          </Text>
        </div>
        <Group gap="xs">
          <Button
            variant="default"
            size="sm"
            radius="xl"
            leftSection={<IconRefresh size={14} />}
            onClick={() => onChanged?.()}
          >
            刷新
          </Button>
          <Button
            size="sm"
            radius="xl"
            leftSection={<IconPlus size={14} />}
            onClick={openCreate}
          >
            新增连接
          </Button>
        </Group>
      </div>

      {error ? <Alert color="red" variant="light" mb="md">{error}</Alert> : null}
      {testResult ? (
        <Alert color="teal" variant="light" mb="md">
          连接测试成功：{testResult.model}，耗时 {testResult.latencyMs} ms。
          {testResult.textPreview ? ` 返回：${testResult.textPreview}` : ''}
        </Alert>
      ) : null}

      {connections.length === 0 ? (
        <div className="admin-empty">
          <IconAlertTriangle size={20} />
          <div>
            <strong>还没有公司模型连接</strong>
            <Text size="sm" c="dimmed">
              新增连接后，前台模型预设中会出现“公司托管”预设；未配置 Key 或禁用的连接会显示为不可用。
            </Text>
          </div>
        </div>
      ) : (
        <div className="admin-connection-list">
          {connections.map((connection) => (
            <article className="admin-connection-card" key={connection.id}>
              <div className="admin-connection-main">
                <Group gap="xs" align="center">
                  <strong>{connection.name}</strong>
                  <Badge variant="light" color="blue" radius="xl">{transportLabel(connection.transportType)}</Badge>
                  <Badge variant="light" color={connection.enabled ? 'teal' : 'red'} radius="xl">
                    {connection.enabled ? '已启用' : '已禁用'}
                  </Badge>
                  <Badge variant="light" color={connection.keyConfigured ? 'teal' : 'yellow'} radius="xl">
                    {connection.keyConfigured ? 'Key 已配置' : 'Key 未配置'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mt={6}>{connection.baseUrl}</Text>
                <div className="admin-model-tags">
                  {connection.models.length === 0 ? (
                    <Text size="xs" c="dimmed">尚未配置模型</Text>
                  ) : connection.models.map((model) => (
                    <Badge
                      key={`${connection.id}-${model.name}`}
                      variant="outline"
                      color={model.enabled ? 'gray' : 'red'}
                      radius="xl"
                      size="sm"
                    >
                      {model.name}{model.enabled ? '' : '（禁用）'}
                    </Badge>
                  ))}
                </div>
              </div>

              <Group gap="xs" className="admin-connection-actions">
                <Button
                  variant="light"
                  size="xs"
                  radius="xl"
                  leftSection={<IconSettings size={14} />}
                  onClick={() => openEdit(connection)}
                >
                  编辑
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  radius="xl"
                  loading={busyId === connection.id}
                  onClick={() => handleTest(connection)}
                >
                  测试连接
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  radius="xl"
                  leftSection={<IconTrash size={14} />}
                  loading={busyId === connection.id}
                  onClick={() => handleDelete(connection)}
                >
                  删除
                </Button>
              </Group>
            </article>
          ))}
        </div>
      )}

      <ConnectionEditor
        opened={editorOpened}
        connection={editingConnection}
        onClose={() => setEditorOpened(false)}
        onSaved={async () => {
          await onChanged?.();
        }}
      />
    </section>
  );
}
