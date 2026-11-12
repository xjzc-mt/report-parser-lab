import { Button, Text } from '@mantine/core';
import { IconLockAccess } from '@tabler/icons-react';

export function ClosedPageOverlay({
  pageLabel = '当前页面',
  description = '',
  onRefresh,
  onGoToAvailable,
  goToAvailableLabel = '前往可用子页'
}) {
  return (
    <div className="closed-page-overlay" role="alertdialog" aria-modal="true" aria-label="页面暂未开放">
      <div className="closed-page-overlay-card">
        <div className="closed-page-overlay-icon">
          <IconLockAccess size={28} stroke={1.7} />
        </div>
        <h2>该页面暂未开放</h2>
        <p>
          {description || `管理员已在后台关闭「${pageLabel}」。当前不能启动新任务，页面交互已冻结；已经运行的任务会按启动时配置完成。`}
        </p>
        <div className="closed-page-overlay-actions">
          {onGoToAvailable ? (
            <Button size="sm" radius="xl" onClick={onGoToAvailable}>
              {goToAvailableLabel}
            </Button>
          ) : null}
          {onRefresh ? (
            <Button size="sm" radius="xl" variant="default" onClick={onRefresh}>
              刷新配置
            </Button>
          ) : null}
        </div>
        <Text size="xs" c="dimmed" mt="md">
          页面开关和默认参数由管理员在 /admin 维护。
        </Text>
      </div>
    </div>
  );
}
