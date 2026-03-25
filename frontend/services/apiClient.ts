import { ConversationAnalysis, Message, Role } from '../types';
import { tokenStore } from './tokenStore';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface RagDocumentSummary {
  id: string;
  originalName: string;
  createdAt: string;
  numChunks: number;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  fileSize: number;
}

export interface RagSearchMatch {
  docId: string;
  filename: string;
  snippet: string;
  score: number;
}

export interface ConversationMessageDTO {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
}

export interface ConversationSummary {
  id: string;
  displayName: string;
  status: string;
  createdAt: string;
  lastMessageAt?: string | null;
  lastMessage?: string | null;
}

export interface CannedResponse {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface AgentSettings {
  brandName: string;
  greetingLine: string;
  escalateCopy: string;
  businessHours: string;
  defaultTags: string[];
}

export interface MemberProfile {
  memberId: string;
  name: string;
  email: string;
  phone?: string | null;
  tier?: string | null;
  city?: string | null;
  status?: string | null;
  joinedAt: string;
}

export interface MemberPurchase {
  id: string;
  productName: string;
  amount: number;
  currency: string;
  channel?: string | null;
  purchasedAt: string;
  notes?: string | null;
}

type SerializedMessage = Pick<Message, 'role' | 'content'> & { timestamp?: string };

const serializeHistory = (history: Message[]): SerializedMessage[] =>
  history.map(({ role, content, timestamp }) => {
    const normalizedTimestamp = timestamp instanceof Date
      ? timestamp.toISOString()
      : typeof timestamp === 'string'
        ? timestamp
        : undefined;
    return normalizedTimestamp ? { role, content, timestamp: normalizedTimestamp } : { role, content };
  });

const handleError = async (response: Response) => {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') {
      message = body.error;
    } else if (body?.detail) {
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    }
  } catch {
    // Ignore JSON parse errors
  }
  throw new Error(message);
};

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = tokenStore.get();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    await handleError(response);
  }
  return response.json() as Promise<T>;
};

const postJson = async <T>(path: string, payload?: unknown): Promise<T> => {
  return requestJson<T>(path, {
    method: 'POST',
    headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined
  });
};

const postForm = async <T>(path: string, formData: FormData): Promise<T> => {
  return requestJson<T>(path, {
    method: 'POST',
    body: formData
  });
};

const deleteJson = async <T>(path: string): Promise<T> => {
  return requestJson<T>(path, { method: 'DELETE' });
};

const getBlob = async (path: string): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    await handleError(response);
  }
  return response.blob();
};

export const analyzeConversation = async (history: Message[]): Promise<ConversationAnalysis> => {
  return postJson<ConversationAnalysis>('/analyze', { history: serializeHistory(history) });
};

export const queryKnowledgeBase = async (query: string): Promise<string> => {
  const { result } = await postJson<{ result: string }>('/kb-query', { query });
  return result;
};

export const generateDailyReport = async (): Promise<string> => {
  const { report } = await postJson<{ report: string }>('/report');
  return report;
};

export const listRagDocuments = async (): Promise<RagDocumentSummary[]> => {
  return requestJson<RagDocumentSummary[]>('/rag/documents');
};

export const uploadRagDocument = async (file: File): Promise<RagDocumentSummary> => {
  const formData = new FormData();
  formData.append('file', file);
  return postForm<RagDocumentSummary>('/rag/documents', formData);
};

export const deleteRagDocument = async (docId: string): Promise<void> => {
  await deleteJson(`/rag/documents/${docId}`);
};

export const downloadRagDocument = async (docId: string): Promise<Blob> => {
  return getBlob(`/rag/documents/${docId}/download`);
};

export const searchRag = async (query: string, topK = 3): Promise<RagSearchMatch[]> => {
  const { matches } = await postJson<{ matches: RagSearchMatch[] }>('/rag/search', { query, topK });
  return matches;
};

export const fetchAgentSettings = async (settingsId: string): Promise<AgentSettings> => {
  const { settings } = await requestJson<{ settings: AgentSettings }>(`/settings/${settingsId}`);
  return settings;
};

export const saveAgentSettings = async (settingsId: string, payload: AgentSettings): Promise<AgentSettings> => {
  const { settings } = await requestJson<{ settings: AgentSettings }>(`/settings/${settingsId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return settings;
};

export const fetchMemberProfile = async (memberId: string): Promise<MemberProfile> => {
  const { member } = await requestJson<{ member: MemberProfile }>(`/members/${memberId}`);
  return member;
};

export const fetchMemberPurchases = async (memberId: string, limit = 25): Promise<MemberPurchase[]> => {
  const params = new URLSearchParams({ limit: String(limit) });
  const { purchases } = await requestJson<{ purchases: MemberPurchase[] }>(
    `/members/${memberId}/purchases?${params.toString()}`
  );
  return purchases;
};

export const listConversations = async (): Promise<ConversationSummary[]> => {
  const { conversations } = await requestJson<{ conversations: ConversationSummary[] }>('/conversations');
  return conversations;
};

export const createConversation = async (displayName?: string): Promise<ConversationSummary> => {
  return postJson<ConversationSummary>('/conversations', { displayName: displayName || '' });
};

export const deleteConversation = async (conversationId: string): Promise<void> => {
  await deleteJson(`/conversations/${conversationId}`);
};

export const updateConversationStatus = async (conversationId: string, status: string): Promise<void> => {
  await requestJson(`/conversations/${conversationId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
};

export const listCannedResponses = async (): Promise<CannedResponse[]> => {
  const { responses } = await requestJson<{ responses: CannedResponse[] }>('/canned-responses');
  return responses;
};

export const createCannedResponse = async (title: string, content: string): Promise<CannedResponse> => {
  return postJson<CannedResponse>('/canned-responses', { title, content });
};

export const deleteCannedResponse = async (id: string): Promise<void> => {
  await deleteJson(`/canned-responses/${id}`);
};

// ---------------------------------------------------------------------------
// User management (admin only)
// ---------------------------------------------------------------------------

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  isActive: boolean;
  createdAt: string;
}

export const listUsers = async (): Promise<UserDTO[]> => {
  return requestJson<UserDTO[]>('/users');
};

export const createUser = async (payload: {
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'agent';
}): Promise<UserDTO> => {
  return postJson<UserDTO>('/users', payload);
};

export const updateUser = async (
  userId: string,
  payload: { name?: string; role?: 'admin' | 'agent'; is_active?: boolean }
): Promise<UserDTO> => {
  return requestJson<UserDTO>(`/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  await requestJson(`/users/${userId}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword }),
  });
};

export const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await requestJson('/auth/change-password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
};

export const createKbEntry = async (title: string, content: string): Promise<RagDocumentSummary> => {
  return postJson<RagDocumentSummary>('/rag/entries', { title, content });
};

export const fetchConversationMessages = async (conversationId: string): Promise<ConversationMessageDTO[]> => {
  const { messages } = await requestJson<{ messages: ConversationMessageDTO[] }>(
    `/conversations/${conversationId}/messages`
  );
  return messages;
};

export const postConversationMessage = async (conversationId: string, role: Role, content: string) => {
  return postJson<ConversationMessageDTO>(`/conversations/${conversationId}/messages`, {
    role,
    content
  });
};
