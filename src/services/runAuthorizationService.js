export function needsCompanyRunAuthorization(runtimeConfig) {
  return Boolean(runtimeConfig?.serverManaged);
}

export async function authorizeCompanyRun(pageKey, { fetchImpl = globalThis.fetch } = {}) {
  if (!pageKey) {
    throw new Error('缺少页面标识，无法申请运行授权。');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法申请运行授权。');
  }

  const response = await fetchImpl('/api/runs/authorize', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-LLM-Lab-Client': 'web'
    },
    body: JSON.stringify({ pageKey })
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || `运行授权失败（HTTP ${response.status}）`;
    const error = new Error(message);
    error.code = data?.error?.code || '';
    error.status = response.status;
    throw error;
  }
  if (!data?.runId) {
    throw new Error('运行授权返回结果缺少 runId。');
  }
  return data.runId;
}
