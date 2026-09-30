(() => {
  const originalFetch = window.fetch.bind(window);
  let tokenPromise;
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return originalFetch(input, options);
    }
    tokenPromise ||= originalFetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.csrfToken) throw new Error('Could not initialize secure request');
        return data.csrfToken;
      }).catch(error => { tokenPromise = null; throw error; });
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-csrf-token', await tokenPromise);
    const response = await originalFetch(input, { ...options, headers });
    if (response.status === 403) tokenPromise = null;
    return response;
  };
})();
