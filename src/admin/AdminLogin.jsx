import { useState } from 'react';
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';

export function AdminLogin({ onLogin, loading = false }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    try {
      await onLogin(username.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败。');
    }
  };

  return (
    <div className="admin-login-shell">
      <Paper className="admin-login-card" radius="lg" p="xl" withBorder>
        <Stack gap="md">
          <div className="admin-login-heading">
            <div className="admin-login-icon"><IconLock size={22} stroke={1.8} /></div>
            <div>
              <Title order={2}>Report Parser Lab 管理后台</Title>
              <Text size="sm" c="dimmed">仅限管理员登录，用于维护公司模型连接与平台配置。</Text>
            </div>
          </div>

          {error ? <Alert color="red" variant="light">{error}</Alert> : null}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="管理员用户名"
                value={username}
                autoComplete="username"
                onChange={(event) => setUsername(event.currentTarget.value)}
                required
              />
              <PasswordInput
                label="管理员密码"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />
              <Button type="submit" size="md" radius="xl" loading={loading}>
                登录管理后台
              </Button>
            </Stack>
          </form>

          <Text size="xs" c="dimmed">
            管理员凭据由部署环境变量初始化。公司 API Key 只保存在服务端，不会下发到浏览器。
          </Text>
          <Button component="a" href="/" variant="subtle" size="xs" radius="xl">
            返回工作台
          </Button>
        </Stack>
      </Paper>
    </div>
  );
}
