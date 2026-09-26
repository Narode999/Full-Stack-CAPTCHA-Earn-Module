/**
 * Single source of truth for talking to the VELoop API.
 *
 * Every call goes through `request()` so that auth, JSON handling and error
 * shaping are identical everywhere. The UI never invents a reward value;
 * it only ever renders what the server returned.
 */

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export class ApiError extends Error {
  constructor(message, { code, status, payload } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function readToken() {
  try {
    const raw = localStorage.getItem('veloop-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError('Cannot reach the VELoop server. Is the backend running on port 5000?', {
      code: 'NETWORK_ERROR'
    });
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    throw new ApiError(data.message || 'Something went wrong. Please try again.', {
      code: data.code,
      status: response.status,
      payload: data
    });
  }

  return data;
}

export const api = {
  register: payload => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: payload => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  currentChallenge: () => request('/captcha/current'),
  newChallenge: () => request('/captcha/new', { method: 'POST' }),
  verifyCaptcha: payload => request('/captcha/verify', { method: 'POST', body: payload }),
  claimReward: payload => request('/captcha/claim', { method: 'POST', body: payload }),
  declineReward: payload => request('/captcha/decline', { method: 'POST', body: payload }),
  history: () => request('/captcha/history'),
  config: () => request('/captcha/config', { auth: false }),
  walletBalance: () => request('/wallet/gems'),
  walletHistory: () => request('/wallet/transactions'),
  securityThreats: (limit = 30) => request(`/security/threats?limit=${limit}`),
  securityStats: () => request('/security/stats')
};
