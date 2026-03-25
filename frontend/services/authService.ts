import { tokenStore } from './tokenStore';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',          // send / receive httpOnly cookies
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const authService = {
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const data = await post<TokenResponse>('/auth/login', { email, password });
    tokenStore.set(data.access_token);
    return data;
  },

  logout: async (): Promise<void> => {
    const token = tokenStore.get();
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => {});
    tokenStore.clear();
  },

  /** Try to get a new access token using the httpOnly refresh cookie. */
  refresh: async (): Promise<TokenResponse | null> => {
    try {
      const data = await post<TokenResponse>('/auth/refresh');
      tokenStore.set(data.access_token);
      return data;
    } catch {
      tokenStore.clear();
      return null;
    }
  },

  me: async (): Promise<AuthUser> => {
    return get<AuthUser>('/auth/me');
  },

  createGuestSession: async (conversationId: string): Promise<string> => {
    const data = await post<{ access_token: string }>('/auth/guest-session', {
      conversation_id: conversationId,
    });
    return data.access_token;
  },
};
