import { ConversationAnalysis, Message, Role } from '../types';

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
  let message = 'Request failed';
  try {
    const body = await response.json();
    if (body?.error) {
      message = body.error;
    }
  } catch {
    // Ignore JSON parse errors
  }
  throw new Error(message);
};

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
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
