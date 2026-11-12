import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmNavigationIfRunning,
  getRunningScopes,
  hasRunningTasks,
  resetRunningTaskGuardForTests,
  setTaskRunning
} from '../src/utils/runningTaskGuard.js';

test.afterEach(() => {
  resetRunningTaskGuardForTests();
  setTaskRunning('task-a', 'scope-a', false);
  setTaskRunning('task-b', 'scope-b', false);
  delete globalThis.window;
});

test('运行任务按 scope 统计，未注册时视为空闲', () => {
  assert.equal(hasRunningTasks(), false);
  setTaskRunning('task-a', 'scope-a', true);
  assert.equal(hasRunningTasks(), true);
  assert.equal(hasRunningTasks('scope-a'), true);
  assert.equal(hasRunningTasks('scope-b'), false);
  assert.deepEqual(getRunningScopes(), ['scope-a']);

  setTaskRunning('task-a', 'scope-a', false);
  assert.equal(hasRunningTasks(), false);
});

test('有运行任务时确认可取消离开', () => {
  globalThis.window = {
    confirm() {
      return false;
    },
    addEventListener() {}
  };
  setTaskRunning('task-a', 'scope-a', true);
  assert.equal(confirmNavigationIfRunning('scope-a'), false);
  assert.equal(confirmNavigationIfRunning('scope-b'), true);
});

test('用户确认后允许离开', () => {
  globalThis.window = {
    confirm() {
      return true;
    },
    addEventListener() {}
  };
  setTaskRunning('task-b', 'scope-b', true);
  assert.equal(confirmNavigationIfRunning('scope-b'), true);
});


test('运行任务会安装 beforeunload 拦截', () => {
  resetRunningTaskGuardForTests();
  let beforeUnloadHandler = null;
  globalThis.window = {
    addEventListener(type, handler) {
      if (type === 'beforeunload') beforeUnloadHandler = handler;
    },
    confirm() {
      return true;
    }
  };
  setTaskRunning('task-c', 'scope-c', true);
  assert.equal(typeof beforeUnloadHandler, 'function');

  const event = {
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    },
    returnValue: undefined
  };
  beforeUnloadHandler(event);
  assert.equal(event.preventDefaultCalled, true);
  assert.equal(event.returnValue, '');
  setTaskRunning('task-c', 'scope-c', false);
});
