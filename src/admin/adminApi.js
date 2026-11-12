export class AdminApiError extends Error {
  constructor(message, status, code = '') {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body = null } = {}) {
  const headers = {
    Accept: 'application/json',
    'X-LLM-Lab-Admin': '1'
  };
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw new AdminApiError(
      data?.error?.message || `请求失败（HTTP ${response.status}）`,
      response.status,
      data?.error?.code || ''
    );
  }
  return data || {};
}

export const adminApi = {
  getSession() {
    return request('/api/admin/session');
  },

  login(username, password) {
    return request('/api/admin/login', {
      method: 'POST',
      body: { username, password }
    });
  },

  logout() {
    return request('/api/admin/logout', { method: 'POST', body: {} });
  },

  listConnections() {
    return request('/api/admin/connections');
  },

  createConnection(payload) {
    return request('/api/admin/connections', {
      method: 'POST',
      body: payload
    });
  },

  updateConnection(id, payload) {
    return request(`/api/admin/connections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload
    });
  },

  deleteConnection(id) {
    return request(`/api/admin/connections/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  probeModels(id) {
    return request(`/api/admin/connections/${encodeURIComponent(id)}/models`);
  },

  testConnection(id, model = '') {
    return request(`/api/admin/connections/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      body: model ? { model } : {}
    });
  },

  getPages() {
    return request('/api/admin/pages');
  },

  updatePages(pages) {
    return request('/api/admin/pages', {
      method: 'PUT',
      body: { pages }
    });
  }
};
