import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listConversations,
  createConversation,
  deleteConversation as apiDeleteConversation,
  fetchConversationMessages,
  postConversationMessage,
  updateConversationStatus,
} from '../services/apiClient';
import type { ConversationSummary } from '../services/apiClient';
import { Message, Role } from '../types';

const POLL_INTERVAL_MS = 3000;

interface UseConversationReturn {
  conversationId: string;
  conversations: ConversationSummary[];
  messages: Message[];
  isPolling: boolean;
  switchConversation: (id: string) => void;
  sendMessage: (role: Role, content: string) => Promise<void>;
  createNew: () => Promise<void>;
  deleteConv: (id: string) => Promise<void>;
  changeStatus: (status: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useConversation(): UseConversationReturn {
  const [conversationId, setConversationId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const activeIdRef = useRef('');

  const normalizeMessages = useCallback((remote: ReturnType<typeof Object.values>[0][]): Message[] =>
    (remote as any[]).map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    })), []);

  const loadMessages = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const remote = await fetchConversationMessages(id);
      const normalized = normalizeMessages(remote);
      setMessages((prev) => {
        const unchanged =
          prev.length === normalized.length &&
          prev.every((m, i) => m.id === normalized[i]?.id);
        return unchanged ? prev : normalized;
      });
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  }, [normalizeMessages]);

  const switchConversation = useCallback((id: string) => {
    activeIdRef.current = id;
    setConversationId(id);
    setMessages([]);
  }, []);

  // Bootstrap: load conversation list on mount
  useEffect(() => {
    let active = true;
    listConversations()
      .then(async (list) => {
        if (!active) return;
        if (list.length > 0) {
          setConversations(list);
          switchConversation(list[0].id);
        } else {
          const newConv = await createConversation('新對話 1');
          if (!active) return;
          setConversations([newConv]);
          switchConversation(newConv.id);
        }
      })
      .catch((err) => console.error('Failed to load conversations', err));
    return () => { active = false; };
  }, [switchConversation]);

  // Poll for new messages
  useEffect(() => {
    if (!conversationId) return;
    setIsPolling(true);
    loadMessages(conversationId);
    const interval = setInterval(() => loadMessages(conversationId), POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [conversationId, loadMessages]);

  const sendMessage = useCallback(async (role: Role, content: string) => {
    await postConversationMessage(conversationId, role, content);
    await loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  const createNew = useCallback(async () => {
    const name = `新對話 ${conversations.length + 1}`;
    const newConv = await createConversation(name);
    setConversations((prev) => [newConv, ...prev]);
    switchConversation(newConv.id);
  }, [conversations.length, switchConversation]);

  const deleteConv = useCallback(async (id: string) => {
    await apiDeleteConversation(id);
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeIdRef.current && remaining.length > 0) {
        switchConversation(remaining[0].id);
      }
      return remaining;
    });
  }, [switchConversation]);

  const changeStatus = useCallback(async (status: string) => {
    if (!conversationId) return;
    await updateConversationStatus(conversationId, status);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
    );
  }, [conversationId]);

  const reload = useCallback(() => loadMessages(conversationId), [conversationId, loadMessages]);

  return {
    conversationId,
    conversations,
    messages,
    isPolling,
    switchConversation,
    sendMessage,
    createNew,
    deleteConv,
    changeStatus,
    reload,
  };
}
