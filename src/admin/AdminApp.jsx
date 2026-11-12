import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Group, Loader, Tabs, Text } from '@mantine/core';
import { IconArrowLeft, IconLayoutList, IconLogout, IconSettings, IconShieldLock } from '@tabler/icons-react';

import { adminApi, AdminApiError } from './adminApi.js';
import { AdminLogin } from './AdminLogin.jsx';
import { CompanyConnectionsPanel } from './CompanyConnectionsPanel.jsx';
import { PageManagementPanel } from './PageManagementPanel.jsx';

export default function AdminApp() {
  const [session, setSession] = useState({ loading: true, authenticated: false, username: '' });
  const [connections, setConnections] = useState([]);
  const [pages, setPages] = useState(null);
  const [activeTab, setActiveTab] = useState('connections');
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState('');

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    setError('');
    try {
      const data = await adminApi.listConnections();
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } catch (loadError) {
      if (loadError instanceof AdminApiError && loadError.status === 401) {
        setSession({ loading: false, authenticated: false, username: '' });
        return;
      }
      setError(loadError instanceof Error ? loadError.message : '读取公司连接失败。');
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  const loadPages = useCallback(async () => {
    try {
      const data = await adminApi.getPages();
      setPages(data.pages || null);
    } catch (loadError) {
      if (loadError instanceof AdminApiError && loadError.status === 401) {
        setSession({ loading: false, authenticated: false, username: '' });
        return;
      }
      setError(loadError instanceof Error ? loadError.message : '读取页面配置失败。');
    }
  }, []);

  useEffect(() => {
    let active = true;
    adminApi.getSession()
      .then((data) => {
        if (!active) return;
        const authenticated = Boolean(data.authenticated);
        setSession({ loading: false, authenticated, username: data.username || '' });
        if (authenticated) {
          void loadConnections();
          void loadPages();
        }
      })
      .catch(() => {
        if (!active) return;
        setSession({ loading: false, authenticated: false, username: '' });
      });
    return () => {
      active = false;
    };
  }, [loadConnections, loadPages]);

  const handleLogin = async (username, password) => {
    setLoginLoading(true);
    setError('');
    try {
      const data = await adminApi.login(username, password);
      setSession({ loading: false, authenticated: true, username: data.username || username });
      await Promise.all([loadConnections(), loadPages()]);
    } catch (loginError) {
      throw loginError;
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch (_) {
      // 会话可能已过期，仍然回到登录页。
    }
    setSession({ loading: false, authenticated: false, username: '' });
    setConnections([]);
  };

  if (session.loading) {
    return (
      <div className="admin-loading">
        <Loader color="blue" />
        <Text size="sm" c="dimmed">正在检查管理员会话...</Text>
      </div>
    );
  }

  if (!session.authenticated) {
    return <AdminLogin onLogin={handleLogin} loading={loginLoading} />;
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand">
          <div className="admin-brand-mark"><IconShieldLock size={20} stroke={1.8} /></div>
          <div>
            <strong>Report Parser Lab 管理后台</strong>
            <Text size="xs" c="dimmed">公司模型连接与平台配置</Text>
          </div>
        </div>
        <Group gap="xs">
          <Button
            component="a"
            href="/"
            variant="default"
            size="sm"
            radius="xl"
            leftSection={<IconArrowLeft size={14} />}
          >
            返回工作台
          </Button>
          <Button
            variant="light"
            color="gray"
            size="sm"
            radius="xl"
            leftSection={<IconLogout size={14} />}
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Group>
      </header>

      <main className="admin-container">
        <div className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">管理员</span>
            <h1>公司模型与后台配置</h1>
            <Text size="sm" c="dimmed">
              管理员：{session.username || 'admin'}。所有公司密钥只保存在服务端，公开接口不会返回 Key、Base URL 或请求参数。
            </Text>
          </div>
        </div>

        {error ? <Alert color="red" variant="light" mb="md">{error}</Alert> : null}

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'connections')}>
          <Tabs.List mb="md">
            <Tabs.Tab value="connections" leftSection={<IconSettings size={14} />}>
              公司模型连接
            </Tabs.Tab>
            <Tabs.Tab value="pages" leftSection={<IconLayoutList size={14} />}>
              页面管理
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="connections">
            {loadingConnections && connections.length === 0 ? (
              <div className="admin-loading"><Loader size="sm" /><Text size="sm" c="dimmed">正在读取公司连接...</Text></div>
            ) : (
              <CompanyConnectionsPanel
                connections={connections}
                onChanged={loadConnections}
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="pages">
            {pages ? (
              <PageManagementPanel
                pages={pages}
                onSaved={(nextPages) => setPages(nextPages)}
              />
            ) : (
              <div className="admin-loading"><Loader size="sm" /><Text size="sm" c="dimmed">正在读取页面配置...</Text></div>
            )}
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  );
}
