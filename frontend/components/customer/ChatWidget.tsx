/**
 * ChatWidget — Customer-facing chatbot interface.
 *
 * Flow:
 *  1. Load brand settings from /api/settings/global
 *  2. Create a new conversation on mount
 *  3. Show PreChatForm (member / guest selection)
 *  4. Once mode is chosen → show chat UI
 *  5. On each user message → call /api/analyze → post suggestedReply as bot reply
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchAgentSettings,
  fetchMemberProfile,
  postConversationMessage,
  fetchConversationMessages,
  createConversation,
  analyzeConversation,
} from '../../services/apiClient';
import type { AgentSettings } from '../../services/apiClient';
import { authService } from '../../services/authService';
import { tokenStore } from '../../services/tokenStore';
import { Message, Role } from '../../types';
import PreChatForm from './PreChatForm';

type CustomerMode = 'unknown' | 'member' | 'guest';

const DEFAULT_SETTINGS: AgentSettings = {
  brandName: '客服助手',
  greetingLine: '有什麼可以幫您的嗎？',
  escalateCopy: '您的需求需要專人協助，正在為您轉接，請稍候...',
  businessHours: '週一至週五 09:00-18:00',
  defaultTags: ['一般客服'],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-end gap-2">
        <BotAvatar />
        <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

export default function ChatWidget() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [customerMode, setCustomerMode] = useState<CustomerMode>('unknown');
  const [isVerified, setIsVerified] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load settings + create conversation + obtain guest token on mount
  useEffect(() => {
    fetchAgentSettings('global')
      .then((s) => setSettings({ ...DEFAULT_SETTINGS, ...s }))
      .catch(() => setSettings(DEFAULT_SETTINGS));

    createConversation()
      .then(async (conv) => {
        setConversationId(conv.id);
        // Obtain a guest token scoped to this conversation so subsequent
        // calls to /api/conversations/:id/messages and /api/members succeed.
        const guestToken = await authService.createGuestSession(conv.id);
        tokenStore.set(guestToken);
      })
      .catch(console.error);

    // Clear guest token when widget unmounts
    return () => { tokenStore.clear(); };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isBotTyping]);

  // Poll for new messages (e.g. agent replies) every 3 seconds
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      try {
        const remote = await fetchConversationMessages(conversationId);
        const normalized: Message[] = remote.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        setMessages((prev) => {
          if (
            prev.length === normalized.length &&
            prev.every((item, i) => item.id === normalized[i]?.id)
          ) return prev;
          return normalized;
        });
      } catch {
        // silently ignore poll errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  // ---------------------------------------------------------------------------
  // Message helpers
  // ---------------------------------------------------------------------------

  const addLocalMessage = (role: Role, content: string): Message => {
    const msg: Message = {
      id: `local-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  const postAndRefresh = useCallback(async (role: Role, content: string) => {
    await postConversationMessage(conversationId, role, content);
    const remote = await fetchConversationMessages(conversationId);
    const normalized: Message[] = remote.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
    }));
    setMessages(normalized);
  }, [conversationId]);

  // ---------------------------------------------------------------------------
  // AI auto-reply
  // ---------------------------------------------------------------------------

  const triggerBotReply = useCallback(async (history: Message[]) => {
    setIsBotTyping(true);
    setIsDisabled(true);
    try {
      const result = await analyzeConversation(history);
      const reply = result.suggestedReply?.trim();
      if (reply) {
        await postAndRefresh(Role.AGENT, reply);
      }
    } catch (err) {
      console.error('Bot reply failed', err);
      // Silently fail — the user can retry by sending another message.
    } finally {
      setIsBotTyping(false);
      setIsDisabled(false);
      inputRef.current?.focus();
    }
  }, [postAndRefresh]);

  // ---------------------------------------------------------------------------
  // Mode selection
  // ---------------------------------------------------------------------------

  const handleSelectGuest = useCallback(async () => {
    setCustomerMode('guest');
    const greeting = `${settings.brandName} 歡迎您！請直接輸入想諮詢的問題。`;
    addLocalMessage(Role.AGENT, greeting);
    if (conversationId) {
      await postConversationMessage(conversationId, Role.AGENT, greeting);
    }
  }, [conversationId, settings.brandName]);

  const handleSelectMember = useCallback(() => {
    setCustomerMode('member');
  }, []);

  // ---------------------------------------------------------------------------
  // Member verification
  // ---------------------------------------------------------------------------

  const handleMemberSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = memberIdInput.trim();
    if (!trimmed) { setMemberError('請輸入會員編號'); return; }
    try {
      const profile = await fetchMemberProfile(trimmed);
      setCustomerId(profile.memberId);
      setCustomerName(profile.name);
      setIsVerified(true);
      setMemberError(null);
      const greeting = `${profile.name} 您好，您已成功驗證。${settings.greetingLine}`;
      await postAndRefresh(Role.AGENT, greeting);
    } catch {
      setMemberError('查無此會員編號，請重新確認');
    }
  };

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isDisabled) return;
    setInputText('');

    // Show user message immediately
    const optimisticMsg: Message = {
      id: `opt-${Date.now()}`,
      role: Role.USER,
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await postConversationMessage(conversationId, Role.USER, text);
      const remote = await fetchConversationMessages(conversationId);
      const history: Message[] = remote.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
      setMessages(history);
      await triggerBotReply(history);
    } catch (err) {
      console.error('Send failed', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showPreChat = customerMode === 'unknown';
  const showMemberForm = customerMode === 'member' && !isVerified;
  const showChat = !showPreChat;

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-2xl overflow-hidden sm:h-[700px] sm:rounded-2xl sm:my-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-base leading-tight truncate">{settings.brandName}</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/80 text-xs">線上服務中</span>
          </div>
        </div>
        {isVerified && (
          <div className="text-right">
            <p className="text-white/90 text-xs font-medium">{customerName}</p>
            <p className="text-white/60 text-[11px]">{customerId}</p>
          </div>
        )}
      </div>

      {/* Body */}
      {showPreChat ? (
        <PreChatForm
          brandName={settings.brandName}
          onSelectGuest={handleSelectGuest}
          onSelectMember={handleSelectMember}
        />
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[78%] items-end gap-2 ${msg.role === Role.USER ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.role === Role.USER ? <UserAvatar /> : <BotAvatar />}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.role === Role.USER
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {isBotTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Member ID form (shown before member is verified) */}
          {showMemberForm && (
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <form onSubmit={handleMemberSubmit} className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">請輸入會員編號</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memberIdInput}
                    onChange={(e) => { setMemberIdInput(e.target.value); setMemberError(null); }}
                    placeholder="例如：M10001"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    確認
                  </button>
                </div>
                {memberError && <p className="text-xs text-red-500">{memberError}</p>}
              </form>
            </div>
          )}

          {/* Input */}
          {!showMemberForm && (
            <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="輸入訊息..."
                  disabled={isDisabled}
                  className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isDisabled}
                  className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
              {settings.businessHours && (
                <p className="text-[11px] text-gray-400 text-center mt-2">{settings.businessHours}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
