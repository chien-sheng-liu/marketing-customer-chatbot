import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import {
  analyzeConversation,
  queryKnowledgeBase,
  generateDailyReport,
  fetchConversationMessages,
  postConversationMessage,
  fetchAgentSettings,
  saveAgentSettings,
  fetchMemberProfile as fetchMemberProfileApi,
  listConversations,
  createConversation,
  deleteConversation as deleteConversationApi,
  updateConversationStatus,
  listCannedResponses,
  createCannedResponse,
  deleteCannedResponse,
} from './services/apiClient';
import type { MemberProfile, ConversationSummary, CannedResponse } from './services/apiClient';
import { Message, Role, ConversationAnalysis, TagType, Sentiment, RoutingAction } from './types';
import { SendIcon, BotIcon, UserIcon, TagIcon, AlertIcon, SearchIcon, ChartIcon, SparklesIcon, SettingsIcon } from './components/Icons';
import { Link } from 'react-router-dom';

type CustomerMode = 'unknown' | 'member' | 'guest';

interface BasicSettings {
  brandName: string;
  greetingLine: string;
  escalateCopy: string;
  businessHours: string;
  defaultTags: string[];
}

const DEFAULT_SETTINGS: BasicSettings = {
  brandName: '客服助手',
  greetingLine: '有什麼可以幫您的嗎？',
  escalateCopy: '您的需求需要專人協助，正在為您轉接，請稍候...',
  businessHours: '週一至週五 09:00-18:00',
  defaultTags: ['一般客服']
};

// Simple Typing Indicator Component
const TypingIndicator = () => (
  <div className="flex justify-start animate-fadeIn">
    <div className="flex flex-row items-end gap-2">
      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
        <BotIcon />
      </div>
      <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
        <span className="text-xs text-gray-400 ml-2">輸入中...</span>
      </div>
    </div>
  </div>
);

interface AppProps {
  mode?: 'agent' | 'customer';
}

const SETTINGS_ID = 'global';

export default function App({ mode = 'agent' }: AppProps) {
  const isAgent = mode === 'agent';
  const { user, logout, isAdmin } = useAuth();
  const [conversationId, setConversationId] = useState<string>('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customerMode, setCustomerMode] = useState<CustomerMode>(isAgent ? 'guest' : 'unknown');
  
  // Customer Auth State
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);

  // Copilot State
  const [analysis, setAnalysis] = useState<ConversationAnalysis | null>(null);
  const [kbQuery, setKbQuery] = useState('');
  const [kbResult, setKbResult] = useState('');
  const [isKbLoading, setIsKbLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [settings, setSettings] = useState<BasicSettings>(DEFAULT_SETTINGS);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [defaultTagsInput, setDefaultTagsInput] = useState('');
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [activeAgentTab, setActiveAgentTab] = useState<'copilot' | 'quick-reply' | 'settings'>('copilot');
  const [convFilter, setConvFilter] = useState<'all' | 'open' | 'active' | 'resolved'>('all');
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [isSavingCanned, setIsSavingCanned] = useState(false);
  
  // Alert State
  const [showSpecialistAlert, setShowSpecialistAlert] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const looksLikeMemberId = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32) return false;
    return !/\s/.test(trimmed);
  }, []);

  const setMemberContext = useCallback((profile: MemberProfile) => {
    setMemberProfile(profile);
    setCustomerId(profile.memberId);
    setCustomerName(profile.name);
    setIsVerified(true);
    setCustomerMode('member');
    setMemberError(null);
  }, []);

  const sendMemberGreeting = useCallback(async (profile: MemberProfile) => {
    await postConversationMessage(
      conversationId,
      Role.AGENT,
      `${profile.memberId}${profile.name}您好，您已連線至 ${settings.brandName} 客服。${settings.greetingLine}`
    );
  }, [conversationId, settings.brandName, settings.greetingLine]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    let active = true;
    setIsSettingsLoading(true);
    setSettingsError(null);
    fetchAgentSettings(SETTINGS_ID)
      .then((data) => {
        if (!active) return;
        const merged = { ...DEFAULT_SETTINGS, ...data };
        setSettings(merged);
        setDefaultTagsInput((merged.defaultTags || []).join(', '));
        setIsSettingsLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error('Failed to load settings', error);
        setSettings(DEFAULT_SETTINGS);
        setDefaultTagsInput(DEFAULT_SETTINGS.defaultTags.join(', '));
        setSettingsError('設定載入失敗，已套用預設值');
        setIsSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isVerified) return;
    if (!isAgent && customerMode !== 'member') return;
    const lastCandidate = [...messages]
      .reverse()
      .find((msg) => msg.role === Role.USER && looksLikeMemberId(msg.content));
    if (!lastCandidate) return;
    const detectedId = lastCandidate.content.trim();
    if (!detectedId || detectedId === customerId) return;
    let canceled = false;
    fetchMemberProfileApi(detectedId)
      .then((profile) => {
        if (canceled) return;
        setMemberContext(profile);
      })
      .catch((error) => {
        console.error('Auto member verification failed', error);
      });
    return () => {
      canceled = true;
    };
  }, [messages, isVerified, customerMode, customerId, setMemberContext, looksLikeMemberId]);

  const switchConversation = useCallback((convId: string) => {
    setConversationId(convId);
    setMessages([]);
    setAnalysis(null);
    setCustomerMode(isAgent ? 'guest' : 'unknown');
    setCustomerId(null);
    setCustomerName('');
    setIsVerified(false);
    setMemberProfile(null);
    setApiError(null);
    setKbQuery('');
    setKbResult('');
    setShowSpecialistAlert(false);
    setMemberIdInput('');
    setMemberError(null);
    setInputText('');
  }, [isAgent]);

  const conversationIdRef = useRef(conversationId);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    let active = true;

    const loadList = async (initial = false) => {
      try {
        const list = await listConversations();
        if (!active) return;
        if (list.length === 0) {
          if (initial) {
            const newConv = await createConversation('新對話 1');
            if (!active) return;
            setConversations([newConv]);
            switchConversation(newConv.id);
          }
          return;
        }
        setConversations(list);
        // On first load, select the first conversation
        if (initial) switchConversation(list[0].id);
      } catch (err) {
        console.error('Failed to load conversations', err);
      }
    };

    loadList(true);
    const interval = setInterval(() => loadList(false), 5000);
    return () => { active = false; clearInterval(interval); };
  }, [switchConversation]);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const remote = await fetchConversationMessages(conversationId);
      const normalized = remote.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages((prev) => {
        if (
          prev.length === normalized.length &&
          prev.every((item, index) => item.id === normalized[index]?.id)
        ) {
          return prev;
        }
        return normalized;
      });
    } catch (err) {
      console.error('Failed to load conversation', err);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    loadConversation();
    const interval = setInterval(loadConversation, 3000);
    return () => clearInterval(interval);
  }, [loadConversation, conversationId]);

  // Trigger analysis whenever user sends a message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === Role.USER) {
      setIsLoading(true);
      analyzeConversation(messages)
        .then(result => {
          setAnalysis(result);
          setIsLoading(false);
          
          // Check for Nutritionist Alert
          if (result.routing === RoutingAction.DIETITIAN) {
            setShowSpecialistAlert(true);
          }
        })
        .catch(err => {
          console.error(err);
          setApiError('AI 分析失敗，請確認後端服務與 API Key 是否正常。');
          setIsLoading(false);
        });
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const messageContent = inputText.trim();
    setInputText('');

    await postConversationMessage(conversationId, isAgent ? Role.AGENT : Role.USER, messageContent);

    if (!isAgent && !isVerified && customerMode === 'member' && looksLikeMemberId(messageContent)) {
      try {
        const profile = await fetchMemberProfileApi(messageContent);
        setMemberContext(profile);
        await sendMemberGreeting(profile);
      } catch (error) {
        console.error('會員驗證失敗', error);
        await postConversationMessage(
          conversationId,
          Role.AGENT,
          '查無此會員編號，請重新確認。'
        );
      }
    }

    await loadConversation();
  };

  const handleSelectMode = async (mode: 'member' | 'guest') => {
    if (customerMode === mode) return;
    setCustomerMode(mode);
    setMemberError(null);
    setMemberIdInput('');
    const brand = settings.brandName;
    const copy = mode === 'guest'
      ? `${brand} 歡迎您！目前以訪客身份進線，直接輸入想諮詢的主題即可開始與品牌顧問對話。`
      : `${brand} 歡迎回來！請輸入會員編號以便我們提供個人化服務。`;
    try {
      await postConversationMessage(conversationId, Role.AGENT, copy);
      await loadConversation();
    } catch (error) {
      console.error('Failed to send welcome message', error);
    }
  };

  const handleMemberIdSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = memberIdInput.trim();
    if (!trimmed) {
      setMemberError('請輸入會員編號');
      return;
    }
    try {
      const profile = await fetchMemberProfileApi(trimmed);
      setMemberContext(profile);
      setMemberError(null);
      await postConversationMessage(conversationId, Role.USER, trimmed);
      await sendMemberGreeting(profile);
      setMemberIdInput('');
      await loadConversation();
    } catch (error) {
      console.error('會員驗證失敗', error);
      const message = error instanceof Error ? error.message : '會員驗證失敗';
      setMemberError(message);
    }
  };

  const handleAgentReply = async (text: string) => {
    await postConversationMessage(conversationId, Role.AGENT, text);
    await loadConversation();
  };

  const handleSettingChange = (field: keyof BasicSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSettingsSaved(false);
    setSettingsError(null);
  };

  const handleDefaultTagsChange = (value: string) => {
    setDefaultTagsInput(value);
    const tags = value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => Boolean(tag));
    setSettings((prev) => ({ ...prev, defaultTags: tags }));
    setSettingsSaved(false);
    setSettingsError(null);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const saved = await saveAgentSettings(SETTINGS_ID, settings);
      setSettings(saved);
      setDefaultTagsInput((saved.defaultTags || []).join(', '));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings', error);
      const message = error instanceof Error ? error.message : '設定儲存失敗，請稍後再試';
      setSettingsError(message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleNewConversation = async () => {
    try {
      const displayName = `新對話 ${conversations.length + 1}`;
      const newConv = await createConversation(displayName);
      setConversations(prev => [newConv, ...prev]);
      switchConversation(newConv.id);
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversationApi(convId);
      const remaining = conversations.filter(c => c.id !== convId);
      setConversations(remaining);
      if (convId === conversationId) {
        if (remaining.length > 0) {
          switchConversation(remaining[0].id);
        } else {
          const newConv = await createConversation('新對話 1');
          setConversations([newConv]);
          switchConversation(newConv.id);
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  useEffect(() => {
    if (!isAgent) return;
    listCannedResponses().then(setCannedResponses).catch(console.error);
  }, [isAgent]);

  const handleStatusChange = async (newStatus: string) => {
    if (!conversationId) return;
    await updateConversationStatus(conversationId, newStatus);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, status: newStatus } : c));
  };

  const handleApplyCanned = (content: string) => {
    setInputText(content);
  };

  const handleAddCanned = async () => {
    if (!newCannedTitle.trim() || !newCannedContent.trim()) return;
    setIsSavingCanned(true);
    try {
      const created = await createCannedResponse(newCannedTitle.trim(), newCannedContent.trim());
      setCannedResponses(prev => [created, ...prev]);
      setNewCannedTitle('');
      setNewCannedContent('');
    } catch (err) {
      console.error('Failed to create canned response', err);
    } finally {
      setIsSavingCanned(false);
    }
  };

  const handleDeleteCanned = async (id: string) => {
    await deleteCannedResponse(id);
    setCannedResponses(prev => prev.filter(c => c.id !== id));
  };

  const handleKbSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbQuery.trim()) return;
    setIsKbLoading(true);
    try {
      const result = await queryKnowledgeBase(kbQuery);
      setKbResult(result);
    } catch (err) {
      console.error(err);
      setKbResult('查詢失敗，請確認後端服務是否正常運行。');
    } finally {
      setIsKbLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    setShowReportModal(true);
    setIsReportLoading(true);
    try {
      const report = await generateDailyReport();
      setReportContent(report);
    } catch (err) {
      console.error(err);
      setReportContent('報告生成失敗，請確認後端服務是否正常運行。');
    } finally {
      setIsReportLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (!analysis) return;
    const currentTags = analysis.tags || [];
    let newTags;
    if (currentTags.includes(tag as TagType)) {
      newTags = currentTags.filter(t => t !== tag);
    } else {
      newTags = [...currentTags, tag as TagType];
    }
    setAnalysis({ ...analysis, tags: newTags });
  };

  const showMembershipPrompt = !isAgent && customerMode === 'unknown';
  const showMemberIdForm = !isAgent && customerMode === 'member' && !isVerified;
  const verificationBadge = (() => {
    if (showMembershipPrompt) {
      return {
        label: '請選擇身份',
        className: 'bg-yellow-100 text-yellow-700'
      };
    }
    if (customerMode === 'member' && !isVerified) {
      return {
        label: '待會員驗證',
        className: 'bg-yellow-100 text-yellow-700'
      };
    }
    if (isVerified) {
      return {
        label: '會員已驗證',
        className: 'bg-green-100 text-green-700'
      };
    }
    return {
      label: '訪客模式',
      className: 'bg-gray-200 text-gray-600'
    };
  })();

  // Helper to render sentiment badge
  const renderSentiment = (sentiment: Sentiment) => {
    const colors = {
      [Sentiment.POSITIVE]: 'bg-green-100 text-green-800 border-green-200',
      [Sentiment.NEUTRAL]: 'bg-gray-100 text-gray-800 border-gray-200',
      [Sentiment.NEGATIVE]: 'bg-orange-100 text-orange-800 border-orange-200',
      [Sentiment.ANGRY]: 'bg-red-100 text-red-800 border-red-200',
    };
    const labels = {
      [Sentiment.POSITIVE]: '正向',
      [Sentiment.NEUTRAL]: '中性',
      [Sentiment.NEGATIVE]: '負向',
      [Sentiment.ANGRY]: '憤怒',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[sentiment] || colors.neutral}`}>
        {labels[sentiment] || sentiment.toUpperCase()}
      </span>
    );
  };

  // Helper to render Tags
  const renderTags = (tags: string[], isFallback = false) => {
    return tags.map(tag => {
      let style = "bg-gray-100 text-gray-700 border-gray-200";
      if (['營養師', '產品專家', '產品顧問', 'Solutions Architect'].includes(tag)) {
        style = "bg-purple-100 text-purple-700 border-purple-200 font-bold";
      }
      if (tag === '一般客服') style = "bg-blue-100 text-blue-700 border-blue-200";
      if (['訂單', '物流'].includes(tag)) style = "bg-yellow-50 text-yellow-700 border-yellow-200";
      const fallbackClass = isFallback ? 'opacity-70 italic' : '';
      return (
        <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${style} ${fallbackClass}`}>
          <TagIcon /> {tag}
        </span>
      );
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">

      {/* SIDEBAR: Conversation List (agent only) */}
      {isAgent && (() => {
        const statusDot: Record<string, string> = {
          open: 'bg-yellow-400',
          active: 'bg-green-500',
          resolved: 'bg-gray-300',
        };
        const filtered = convFilter === 'all' ? conversations : conversations.filter(c => c.status === convFilter);
        return (
          <div className="hidden md:flex flex-col w-1/5 bg-white border-r border-gray-200 flex-shrink-0">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">對話列表</span>
              <button
                onClick={handleNewConversation}
                className="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                + 新對話
              </button>
            </div>
            <div className="flex border-b border-gray-100 text-[11px]">
              {(['all', 'open', 'active', 'resolved'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setConvFilter(f)}
                  className={`flex-1 py-1.5 font-medium transition-colors ${convFilter === f ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {f === 'all' ? '全部' : f === 'open' ? '待處理' : f === 'active' ? '進行中' : '已結案'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => switchConversation(conv.id)}
                  className={`px-3 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 group flex items-start gap-2 ${
                    conv.id === conversationId ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                  }`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusDot[conv.status] ?? 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${conv.id === conversationId ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {conv.displayName}
                    </p>
                    {conv.lastMessage && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{conv.lastMessage}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs mt-0.5"
                    title="刪除對話"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-gray-400 p-3 text-center">尚無對話</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* CHAT: Chat Interface */}
      <div className={`${isAgent ? 'flex-1 min-w-0 border-r border-gray-200' : 'w-full'} flex flex-col bg-white`}>
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shadow-sm z-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Growth Inbox</p>
            <h2 className="font-bold text-lg text-gray-800">客戶旅程視圖</h2>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              會員 ID：
              <span className={`font-mono font-medium ${customerId ? 'text-indigo-600' : 'text-gray-400'}`}>
                {customerId ? `${customerId} ${customerName}` : '尚未提供'}
              </span>
            </p>
            {settings.businessHours && (
              <p className="text-[11px] text-gray-400 mt-1">營運時段：{settings.businessHours}</p>
            )}
            {memberProfile?.tier && (
              <p className="text-[11px] text-gray-400 mt-1">會員等級：{memberProfile.tier}</p>
            )}
          </div>
          {isAgent && (
            <div className="flex items-center gap-2">
              {(['open', 'active', 'resolved'] as const).map(s => {
                const current = conversations.find(c => c.id === conversationId)?.status;
                const labels: Record<string, string> = { open: '待處理', active: '處理中', resolved: '已結案' };
                const active = current === s;
                const colors: Record<string, string> = {
                  open: active ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'text-gray-400 border-gray-200 hover:bg-gray-50',
                  active: active ? 'bg-green-100 text-green-700 border-green-300' : 'text-gray-400 border-gray-200 hover:bg-gray-50',
                  resolved: active ? 'bg-gray-200 text-gray-600 border-gray-300' : 'text-gray-400 border-gray-200 hover:bg-gray-50',
                };
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${colors[s]}`}
                  >
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {apiError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex justify-between items-center">
            <span>{apiError}</span>
            <button onClick={() => setApiError(null)} className="ml-2 font-bold hover:text-red-900">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-[80%] ${msg.role === Role.USER ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === Role.USER ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}`}>
                  {msg.role === Role.USER ? <UserIcon /> : <BotIcon />}
                </div>
                <div
                  className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${
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
          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white space-y-3">
          {showMembershipPrompt && (
            <div className="border border-dashed border-gray-300 rounded-2xl p-4 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700 mb-2">請先選擇身份</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => { handleSelectMode('member'); }}
                  className="flex-1 px-4 py-2 rounded-xl border border-indigo-200 text-indigo-600 font-semibold hover:bg-white bg-indigo-50"
                >
                  我是會員
                </button>
                <button
                  type="button"
                  onClick={() => { handleSelectMode('guest'); }}
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-gray-600 font-semibold hover:bg-gray-100"
                >
                  不是會員，直接諮詢
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">會員可獲得個人化資料，非會員仍可直接與品牌顧問聊天。</p>
            </div>
          )}

          {showMemberIdForm && (
            <form onSubmit={handleMemberIdSubmit} className="space-y-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider">輸入會員編號以完成驗證</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={memberIdInput}
                  onChange={(e) => {
                    setMemberIdInput(e.target.value);
                    if (memberError) setMemberError(null);
                  }}
                  placeholder="例如：M10001 或 VIP-001"
                  className="flex-1 px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
                >
                  開始服務
                </button>
              </div>
              {memberError && <p className="text-xs text-red-500">{memberError}</p>}
              <p className="text-[11px] text-gray-400">資訊僅用於查找過往紀錄。</p>
            </form>
          )}

          {!showMembershipPrompt && !showMemberIdForm && (
            <form onSubmit={handleSendMessage}>
              {isAgent && (
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 pl-1">客服回覆</p>
              )}
              <div className="relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={isAgent ? "輸入回覆內容..." : isVerified ? "輸入訊息，與品牌顧問對話..." : "輸入想諮詢的主題，若為會員可加上編號"}
                  className={`w-full pl-4 pr-12 py-3 rounded-full border focus:outline-none focus:ring-2 focus:border-transparent transition-all ${isAgent ? 'border-indigo-300 focus:ring-indigo-500 bg-indigo-50' : 'border-gray-300 focus:ring-indigo-500'}`}
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* RIGHT: Agent Copilot Dashboard */}
      {isAgent && (
      <div className="hidden md:flex flex-col w-2/5 bg-gray-100 h-full overflow-hidden flex-shrink-0">
          <div className="p-4 bg-white border-b border-gray-200 shadow-sm flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-2 rounded-lg shadow-lg">
              <SparklesIcon />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">{settings.brandName}</p>
              <h1 className="font-bold text-xl text-gray-800">AI Copilot Console</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/documents"
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                知識工作空間
              </Link>
            )}
            <button
              onClick={handleGenerateReport}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm transition-colors shadow-sm"
            >
              <ChartIcon />
              <span>每日報告</span>
            </button>
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200">
              <span className="text-xs text-gray-500">{user?.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                {isAdmin ? 'Admin' : 'Agent'}
              </span>
              <button
                onClick={() => logout()}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
                title="登出"
              >
                登出
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-4 pb-2 border-b border-gray-200 bg-gray-100 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveAgentTab('copilot')}
              className={`px-4 py-2 text-xs font-semibold rounded-full flex items-center gap-2 ${
                activeAgentTab === 'copilot'
                  ? 'bg-white text-indigo-600 shadow'
                  : 'text-gray-500 hover:text-indigo-600'
              }`}
            >
              Copilot 面板
            </button>
            <button
              type="button"
              onClick={() => setActiveAgentTab('quick-reply')}
              className={`px-4 py-2 text-xs font-semibold rounded-full flex items-center gap-2 ${
                activeAgentTab === 'quick-reply'
                  ? 'bg-white text-indigo-600 shadow'
                  : 'text-gray-500 hover:text-indigo-600'
              }`}
            >
              快速回覆
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveAgentTab('settings')}
                className={`px-4 py-2 text-xs font-semibold rounded-full flex items-center gap-2 ${
                  activeAgentTab === 'settings'
                    ? 'bg-white text-indigo-600 shadow'
                    : 'text-gray-500 hover:text-indigo-600'
                }`}
              >
                <SettingsIcon />
                設定
              </button>
            )}
          </div>

          <div className="p-6 space-y-6">

          {activeAgentTab === 'quick-reply' ? (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">快速回覆範本</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cannedResponses.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">尚無範本，在下方新增第一個。</p>
                ) : (
                  cannedResponses.map(cr => (
                    <div key={cr.id} className="flex items-start gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">{cr.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cr.content}</p>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleApplyCanned(cr.content)}
                          className="text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          套用
                        </button>
                        <button
                          onClick={() => handleDeleteCanned(cr.id)}
                          className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 opacity-0 group-hover:opacity-100"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <p className="text-xs text-gray-500 font-medium">新增範本</p>
                <input
                  type="text"
                  value={newCannedTitle}
                  onChange={e => setNewCannedTitle(e.target.value)}
                  placeholder="範本名稱（例如：感謝來信）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <textarea
                  value={newCannedContent}
                  onChange={e => setNewCannedContent(e.target.value)}
                  placeholder="回覆內容..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
                <button
                  onClick={handleAddCanned}
                  disabled={isSavingCanned || !newCannedTitle.trim() || !newCannedContent.trim()}
                  className="w-full py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSavingCanned ? '儲存中...' : '新增範本'}
                </button>
              </div>
            </div>
          ) : activeAgentTab === 'settings' ? (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">基本設定</h3>
                  <p className="text-xs text-gray-400">自訂品牌名稱、營運資訊與標籤，統一客服體驗。</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {isSettingsLoading && <span className="text-gray-400">載入中...</span>}
                  {settingsSaved && !isSettingsLoading && <span className="text-green-600">已儲存</span>}
                </div>
              </div>
              {settingsError && (
                <p className="text-xs text-red-500 mb-3">{settingsError}</p>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">品牌名稱</label>
                  <input
                    type="text"
                    value={settings.brandName}
                    onChange={(e) => handleSettingChange('brandName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    placeholder="例如：Kamee Growth Desk"
                    disabled={isSettingsLoading || isSavingSettings}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">迎賓開場</label>
                  <textarea
                    value={settings.greetingLine}
                    onChange={(e) => handleSettingChange('greetingLine', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    rows={2}
                    placeholder="輸入客服開場白"
                    disabled={isSettingsLoading || isSavingSettings}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">營運時段</label>
                  <input
                    type="text"
                    value={settings.businessHours}
                    onChange={(e) => handleSettingChange('businessHours', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    placeholder="例如：週一至週五 09:00-18:00"
                    disabled={isSettingsLoading || isSavingSettings}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">專家轉接提示</label>
                  <textarea
                    value={settings.escalateCopy}
                    onChange={(e) => handleSettingChange('escalateCopy', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    rows={2}
                    placeholder="輸入需要轉接專家的話術"
                    disabled={isSettingsLoading || isSavingSettings}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">預設標籤（以逗號分隔）</label>
                  <input
                    type="text"
                    value={defaultTagsInput}
                    onChange={(e) => handleDefaultTagsChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    placeholder="例如：訂單, VIP"
                    disabled={isSettingsLoading || isSavingSettings}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    disabled={isSettingsLoading || isSavingSettings}
                  >
                    {isSavingSettings ? '儲存中...' : '儲存設定'}
                  </button>
                </div>
              </div>
            </div>
          ) : (

          <>

          {/* 1. Internal SOP Search (Moved to Top) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
             <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <SearchIcon />
                Knowledge Pulse 搜尋
              </h3>
              <span className="text-[11px] text-gray-400">即時串聯 SOP / FAQ</span>
            </div>
            <form onSubmit={handleKbSearch} className="flex gap-2 mb-3">
              <input
                type="text"
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
                placeholder="輸入產品策略、價格、導入相關問題..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                type="submit" 
                disabled={isKbLoading}
                className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-900 disabled:opacity-70"
              >
                {isKbLoading ? '搜尋中' : '啟動搜尋'}
              </button>
            </form>
            {kbResult && (
              <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 border border-gray-200 max-h-32 overflow-y-auto">
                <span className="font-bold block mb-1">搜尋結果</span>
                <div className="whitespace-pre-wrap">{kbResult}</div>
              </div>
            )}
          </div>

          {/* 2. Smart Reply Suggestion (High Priority) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
             <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Copilot 推薦話術
            </h3>
            <p className="text-xs text-gray-400 mb-4">自動融合品牌語氣、SOP 與即時情緒，確保每個回覆都像產品功能般一致。</p>
            {analysis?.suggestedReply ? (
              <div>
                <div className="bg-indigo-50 p-4 rounded-lg text-gray-800 text-sm leading-relaxed border border-indigo-100">
                  {analysis.suggestedReply}
                </div>
                <div className="mt-3 flex gap-2">
                  <button 
                    onClick={() => handleAgentReply(analysis.suggestedReply)}
                    className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex justify-center items-center gap-2"
                  >
                    <SendIcon /> 套用建議回覆
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-600">
                    編輯語氣
                  </button>
                </div>
              </div>
            ) : (
               <div className="text-center py-4 text-gray-400 text-sm">等待 Copilot 分析對話脈絡後自動生成話術...</div>
            )}
          </div>

          {/* 3. Upsell Opportunity */}
          {analysis?.upsellOpportunity?.detected && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-5 shadow-sm border border-emerald-100">
               <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                <SparklesIcon />
                Revenue Play
              </h3>
              <p className="text-sm text-emerald-900 mb-3">
                {analysis.upsellOpportunity.suggestion}
              </p>
              <button className="text-xs bg-white text-emerald-700 border border-emerald-200 px-3 py-1 rounded font-medium shadow-sm hover:bg-emerald-50">
                查看推薦方案
              </button>
            </div>
          )}

          {/* 4. Risk Alerts (Non-Dietitian) */}
          {(analysis?.routing && analysis.routing !== RoutingAction.NONE && analysis.routing !== RoutingAction.DIETITIAN) && (
            <div className={`rounded-xl p-4 border-l-4 shadow-sm animate-pulse bg-red-50 border-red-500`}>
              <div className="flex items-start gap-3">
                <div className="text-red-600">
                  <AlertIcon />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm text-red-800">
                    Growth Desk Alert · {analysis.routing.replace('_', ' ').toUpperCase()}
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    對話觸發風險條件，建議立即啟動升級流程或交由專責單位處理。
                  </p>
                  <button className="mt-2 px-3 py-1 bg-white border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 shadow-sm">
                    升級對話
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. Context Analysis Card (Moved to Bottom) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 transition-all hover:shadow-md">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Journey Intelligence
            </h3>
            
            {analysis ? (
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400 block">意圖標籤</label>
                    <button 
                      onClick={() => setIsEditingTags(!isEditingTags)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {isEditingTags ? '完成' : '編輯標籤'}
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {analysis.tags.length > 0
                      ? renderTags(analysis.tags)
                      : settings.defaultTags.length > 0
                        ? renderTags(settings.defaultTags, true)
                        : <span className="text-gray-400 text-sm">-</span>}
                  </div>
                  {analysis.tags.length === 0 && settings.defaultTags.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">顯示預設標籤（可在基本設定中調整）</p>
                  )}

                  {isEditingTags && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg animate-fadeIn">
                      <p className="text-xs text-gray-500 mb-2 font-medium">新增/移除標籤：</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(TagType).map(tag => (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                               analysis.tags.includes(tag) 
                               ? 'bg-indigo-100 text-indigo-700 border-indigo-200 font-bold' 
                               : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="col-span-1">
                  <label className="text-xs text-gray-400 block mb-1">客戶情緒雷達</label>
                  {renderSentiment(analysis.sentiment)}
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Copilot 理由</label>
                  <p className="text-sm text-gray-600 italic bg-gray-50 p-2 rounded border border-gray-100">
                    "{analysis.reasoning}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-sm">等待對話觸發 Journey Intelligence...</div>
            )}
          </div>
          </>
          )}

        </div>
      </div>
    </div>
      )}

      {/* Report Modal */}
      {isAgent && showReportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <ChartIcon /> Growth Pulse 營運報告
              </h2>
              <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 overflow-y-auto font-sans">
              {isReportLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
                   <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                   <p className="animate-pulse">正在蒐集中樞指標並生成 Growth Pulse 洞察...</p>
                </div>
              ) : (
                <div className="text-sm text-gray-800 leading-relaxed">
                  <div className="whitespace-pre-wrap font-sans bg-gray-50 p-6 rounded-lg border border-gray-200">{reportContent}</div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowReportModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">關閉</button>
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm shadow-sm">匯出摘要</button>
            </div>
          </div>
        </div>
      )}

      {/* Specialist Alert Modal (Replaces inline card) */}
      {showSpecialistAlert && (
        <div className="fixed inset-0 bg-purple-900/30 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border-t-4 border-purple-600 transform transition-all scale-100">
            <div className="flex items-start gap-4">
              <div className="bg-purple-100 p-3 rounded-full text-purple-600">
                 <AlertIcon />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-1">專家諮詢建議</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Copilot 偵測此對話涉及進階技術或客製需求。為確保導入品質，建議升級到產品專家線。
                </p>
                
                <div className="flex gap-3 justify-end">
                  <button 
                    onClick={() => setShowSpecialistAlert(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                  >
                    暫不轉接
                  </button>
                  <button 
                    onClick={() => {
                      setShowSpecialistAlert(false);
                      handleAgentReply(settings.escalateCopy || DEFAULT_SETTINGS.escalateCopy);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg text-sm font-medium shadow-sm"
                  >
                    啟用專家線
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
