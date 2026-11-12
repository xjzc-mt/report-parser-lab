export const PLATFORM_CONFIG_CHANNEL = 'llm-lab-platform-config';

export function notifyPlatformConfigChanged(reason = 'updated') {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }
  try {
    const channel = new BroadcastChannel(PLATFORM_CONFIG_CHANNEL);
    channel.postMessage({ reason, at: Date.now() });
    channel.close();
  } catch (_) {
    // 不支持 BroadcastChannel 时由聚焦刷新兜底
  }
}

export function subscribePlatformConfigChanged(handler, win = globalThis) {
  if (typeof win.BroadcastChannel === 'undefined' || typeof handler !== 'function') {
    return () => {};
  }
  try {
    const channel = new win.BroadcastChannel(PLATFORM_CONFIG_CHANNEL);
    const listener = (event) => {
      handler(event?.data || {});
    };
    channel.addEventListener('message', listener);
    return () => {
      channel.removeEventListener('message', listener);
      channel.close();
    };
  } catch (_) {
    return () => {};
  }
}
