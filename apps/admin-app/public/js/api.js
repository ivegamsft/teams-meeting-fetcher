const API = {
  async request(path, options = {}) {
    const url = `/api${path}`;
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const config = {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
    };

    try {
      const response = await fetch(url, config);
      if (response.status === 401) {
        window.location.reload();
        return null;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API error [${path}]:`, err);
      throw err;
    }
  },

  auth: {
    status: () => API.request('/auth/status'),
  },

  subscriptions: {
    list: () => API.request('/subscriptions'),
    get: (id) => API.request(`/subscriptions/${id}`),
    create: (data) => API.request('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
    renew: (id) => API.request(`/subscriptions/${id}/renew`, { method: 'PATCH' }),
    delete: (id) => API.request(`/subscriptions/${id}`, { method: 'DELETE' }),
    syncGroup: () => API.request('/subscriptions/sync-group', { method: 'POST' }),
  },

  meetings: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) query.set(k, v); });
      const qs = query.toString();
      return API.request(`/meetings${qs ? '?' + qs : ''}`);
    },
    get: (id) => API.request(`/meetings/${id}`),
    transcript: (id, type) => API.request(`/meetings/${id}/transcript?type=${type || 'sanitized'}`),
  },

  transcripts: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) query.set(k, v); });
      const qs = query.toString();
      return API.request(`/transcripts${qs ? '?' + qs : ''}`);
    },
    get: (id) => API.request(`/transcripts/${id}`),
  },

  config: {
    get: () => API.request('/config'),
    update: (data) => API.request('/config', { method: 'PUT', body: JSON.stringify(data) }),
    health: () => API.request('/config/health'),
  },
};
