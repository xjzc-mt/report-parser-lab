import { useEffect, useRef } from 'react';

const runningTasks = new Map();
let beforeUnloadInstalled = false;

function ensureBeforeUnloadListener() {
  if (beforeUnloadInstalled || typeof window === 'undefined') {
    return;
  }
  beforeUnloadInstalled = true;
  window.addEventListener('beforeunload', (event) => {
    if (runningTasks.size === 0) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  });
}

export function resetRunningTaskGuardForTests() {
  runningTasks.clear();
  beforeUnloadInstalled = false;
}

export function setTaskRunning(taskId, scope, running) {
  if (!taskId || !scope) {
    return;
  }
  if (running) {
    runningTasks.set(taskId, { scope });
    ensureBeforeUnloadListener();
  } else {
    runningTasks.delete(taskId);
  }
}

export function getRunningScopes() {
  return Array.from(new Set(Array.from(runningTasks.values()).map((item) => item.scope)));
}

export function hasRunningTasks(scopes = null) {
  if (runningTasks.size === 0) {
    return false;
  }
  if (!scopes) {
    return true;
  }
  const targets = new Set(Array.isArray(scopes) ? scopes : [scopes]);
  return Array.from(runningTasks.values()).some((item) => targets.has(item.scope));
}

export function confirmNavigationIfRunning(scopes = null, message = '有任务正在运行，离开当前页面会中断本次未完成的结果。确定离开吗？') {
  if (!hasRunningTasks(scopes)) {
    return true;
  }
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return false;
  }
  return window.confirm(message);
}

export function useRunningTaskGuard(scope, isRunning) {
  const taskIdRef = useRef(`task_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    setTaskRunning(taskIdRef.current, scope, Boolean(isRunning));
    return () => {
      setTaskRunning(taskIdRef.current, scope, false);
    };
  }, [isRunning, scope]);
}
