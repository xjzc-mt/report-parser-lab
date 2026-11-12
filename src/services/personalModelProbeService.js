function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

export function extractModelIds(payload) {
  const rawList = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.models) ? payload.models : []));

  return Array.from(new Set(
    rawList
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.id || item?.name || item?.model || '';
      })
      .map((name) => String(name || '').trim().replace(/^models\//, ''))
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right));
}

export async function probePersonalModels({
  baseUrl,
  apiKey,
  transportType = 'openai_compatible',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedApiKey = String(apiKey || '').trim();

  if (!normalizedBaseUrl) {
    throw new Error('请先填写接口地址。');
  }
  if (!normalizedApiKey) {
    throw new Error('请先填写 API Key。');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前浏览器不支持 Ping 模型。');
  }

  let url;
  let headers = { Accept: 'application/json' };

  if (transportType === 'openai_compatible') {
    url = normalizedBaseUrl.endsWith('/models')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/models`;
    headers = { ...headers, Authorization: `Bearer ${normalizedApiKey}` };
  } else if (transportType === 'gemini_native') {
    const modelsUrl = normalizedBaseUrl.endsWith('/models')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/models`;
    url = `${modelsUrl}?key=${encodeURIComponent(normalizedApiKey)}`;
  } else {
    throw new Error('当前协议不支持 Ping 模型，请直接填写模型名称。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Ping 失败：模型服务返回 ${response.status}。`);
    }
    const payload = await response.json();
    const models = extractModelIds(payload);
    if (models.length === 0) {
      throw new Error('Ping 成功，但模型服务没有返回可用模型。');
    }
    return models;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Ping 超时，请检查接口地址或稍后重试。');
    }
    if (error instanceof Error && error.message.startsWith('Ping')) {
      throw error;
    }
    throw new Error('Ping 失败，可能是浏览器跨域限制；可以直接填写模型名称。');
  } finally {
    clearTimeout(timer);
  }
}
