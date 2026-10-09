const API_BASE = 'http://127.0.0.1:8000';

// Same as fetch(), but adds the base URL and the login token for you.
export function apiFetch(token, path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}