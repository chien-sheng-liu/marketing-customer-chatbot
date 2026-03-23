import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  analyzeConversation,
  queryKnowledgeBase,
  generateDailyReport,
  fetchConversationMessages,
  postConversationMessage
} from './services/apiClient';
import { Message, Role, ConversationAnalysis, TagType, Sentiment, RoutingAction } from './types';
import { SendIcon, BotIcon, UserIcon, TagIcon, AlertIcon, SearchIcon, ChartIcon, SparklesIcon } from './components/Icons';
import { Link } from 'react-router-dom';

// Mock Customer Database
const MOCK_CUSTOMERS: Record<string, string> = {
  '12345': '陳先生',
  '67890': '林小姐',
  '11111': '王大明',
  '22222': '張阿姨',
  '88888': '李總經理'
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

export default function App({ mode = 'agent' }: AppProps) {
  const isAgent = mode === 'agent';
  const conversationId = 'default';
  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Customer Auth State
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [isVerified, setIsVerified] = useState(false);

  // Copilot State
  const [analysis, setAnalysis] = useState<ConversationAnalysis | null>(null);
  const [kbQuery, setKbQuery] = useState('');
  const [kbResult, setKbResult] = useState('');
  const [isKbLoading, setIsKbLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  
  // Alert State
  const [showSpecialistAlert, setShowSpecialistAlert] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (isVerified) return;
    const idMessage = messages.find((msg) => msg.role === Role.USER && /^\d+$/.test(msg.content.trim()));
    if (!idMessage) return;
    const detectedId = idMessage.content.trim();
    setCustomerId(detectedId);
    setCustomerName(MOCK_CUSTOMERS[detectedId] || '貴賓');
    setIsVerified(true);
  }, [messages, isVerified]);

  const loadConversation = useCallback(async () => {
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
    loadConversation();
    const interval = setInterval(loadConversation, 3000);
    return () => clearInterval(interval);
  }, [loadConversation]);

  // Trigger analysis whenever user sends a message (ONLY if verified)
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (isVerified && lastMsg && lastMsg.role === Role.USER) {
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
  }, [messages, isVerified]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const messageContent = inputText.trim();
    setInputText('');

    // Handle Verification Flow
    if (!isVerified) {
      const idInput = messageContent;

      // STRICT VALIDATION: Check if input is purely numeric
      if (!/^\d+$/.test(idInput)) {
        await postConversationMessage(
          conversationId,
          Role.AGENT,
          'Kamee Growth Desk 提醒：會員編號需為純數字（例如：12345），請重新輸入。'
        );
        await loadConversation();
        return;
      }
      const name = MOCK_CUSTOMERS[idInput] || '貴賓';
      setCustomerId(idInput);
      setCustomerName(name);
      setIsVerified(true);

      await postConversationMessage(conversationId, Role.USER, idInput);
      await postConversationMessage(
        conversationId,
        Role.AGENT,
        `${idInput}${name}您好，您已連線至 Kamee Growth Desk 品牌顧問。今天想優化哪個體驗呢？`
      );
      await loadConversation();
      return;
    }

    await postConversationMessage(conversationId, Role.USER, messageContent);
    await loadConversation();
  };

  const handleAgentReply = async (text: string) => {
    await postConversationMessage(conversationId, Role.AGENT, text);
    await loadConversation();
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
  const renderTags = (tags: string[]) => {
    return tags.map(tag => {
      let style = "bg-gray-100 text-gray-700 border-gray-200";
      if (['營養師', '產品專家', '產品顧問', 'Solutions Architect'].includes(tag)) {
        style = "bg-purple-100 text-purple-700 border-purple-200 font-bold";
      }
      if (tag === '一般客服') style = "bg-blue-100 text-blue-700 border-blue-200";
      if (['訂單', '物流'].includes(tag)) style = "bg-yellow-50 text-yellow-700 border-yellow-200";
      
      return (
        <span key={tag} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${style}`}>
          <TagIcon /> {tag}
        </span>
      );
    });
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      
      {/* LEFT: Chat Interface */}
      <div className={`${isAgent ? 'w-full md:w-2/5 border-r border-gray-200' : 'w-full'} flex flex-col bg-white`}>
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shadow-sm z-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Growth Inbox</p>
            <h2 className="font-bold text-lg text-gray-800">客戶旅程視圖</h2>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              會員 ID：
              <span className={`font-mono font-medium ${customerId ? 'text-indigo-600' : 'text-gray-400'}`}>
                {customerId ? `${customerId} ${customerName}` : '等待輸入'}
              </span>
            </p>
          </div>
          {isAgent && (
            <div className={`text-[11px] px-3 py-1 rounded-full transition-colors ${isVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {isVerified ? '會員已驗證' : '等待會員驗證'}
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

        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
          <div className="relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isVerified ? "輸入訊息，與品牌顧問對話..." : "請輸入會員編號（純數字）"}
              className="w-full pl-4 pr-12 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
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
      </div>

      {/* RIGHT: Agent Copilot Dashboard */}
      {isAgent && (
      <div className="hidden md:flex flex-col w-3/5 bg-gray-100 h-full overflow-hidden">
          <div className="p-4 bg-white border-b border-gray-200 shadow-sm flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-2 rounded-lg shadow-lg">
              <SparklesIcon />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Kamee Growth Desk</p>
              <h1 className="font-bold text-xl text-gray-800">AI Copilot Console</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/documents"
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              知識工作空間
            </Link>
            <button 
              onClick={handleGenerateReport}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm transition-colors shadow-sm"
            >
              <ChartIcon />
              <span>Growth Pulse 報告</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

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
                    {analysis.tags.length > 0 ? renderTags(analysis.tags) : <span className="text-gray-400 text-sm">-</span>}
                  </div>

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
                      handleAgentReply("因您的需求涉及進階產品架構，我將為您轉接 Kamee 產品專家，請稍候...");
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
