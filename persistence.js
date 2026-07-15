(() => {
  const profile = 'local';
  let stateEtag = '';
  let cachedState = null;

  function requestId() {
    return globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function request(path, options = {}, retries = 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(path, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        ...options,
        headers: {
          Accept: 'application/json',
          'X-Request-ID': requestId(),
          ...(options.headers || {}),
        },
      });
      if (response.status === 304) return { notModified: true, etag: response.headers.get('ETag') || stateEtag };
      if (!response.ok) {
        const error = new Error(`Persistence request failed: ${response.status}`);
        error.status = response.status;
        try { error.payload = await response.json(); } catch (_) {}
        throw error;
      }
      return { payload: await response.json(), etag: response.headers.get('ETag') || '' };
    } catch (error) {
      const retryable = !options.method && (error?.name === 'AbortError' || !error?.status || [502, 503, 504].includes(error.status));
      if (retryable && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 150 * (3 - retries)));
        return request(path, options, retries - 1);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.opsPersistence = {
    profile,
    exportUrl: `/api/export?profile=${encodeURIComponent(profile)}`,
    async load() {
      const result = await request(`/api/state?profile=${encodeURIComponent(profile)}`, {
        headers: stateEtag ? { 'If-None-Match': stateEtag } : {},
      }, 2);
      if (result.notModified && cachedState) return cachedState;
      stateEtag = result.etag;
      cachedState = result.payload;
      return cachedState;
    },
    async save(state, revision) {
      const result = await request('/api/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(stateEtag ? { 'If-Match': stateEtag } : {}),
        },
        body: JSON.stringify({ profile, revision, state }),
      });
      stateEtag = result.etag;
      cachedState = result.payload;
      return cachedState;
    },
  };
})();
