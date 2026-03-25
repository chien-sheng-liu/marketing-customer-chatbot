import { useState, useEffect } from 'react';
import { analyzeConversation } from '../services/apiClient';
import { Message, Role, ConversationAnalysis, RoutingAction } from '../types';

interface UseAnalysisReturn {
  analysis: ConversationAnalysis | null;
  isAnalyzing: boolean;
  apiError: string | null;
  showSpecialistAlert: boolean;
  dismissAlert: () => void;
  dismissError: () => void;
  setAnalysis: React.Dispatch<React.SetStateAction<ConversationAnalysis | null>>;
}

export function useAnalysis(messages: Message[], enabled: boolean): UseAnalysisReturn {
  const [analysis, setAnalysis] = useState<ConversationAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showSpecialistAlert, setShowSpecialistAlert] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== Role.USER) return;

    setIsAnalyzing(true);
    analyzeConversation(messages)
      .then((result) => {
        setAnalysis(result);
        if (result.routing === RoutingAction.DIETITIAN) {
          setShowSpecialistAlert(true);
        }
      })
      .catch((err) => {
        console.error(err);
        setApiError('AI 分析失敗，請確認後端服務與 API Key 是否正常。');
      })
      .finally(() => setIsAnalyzing(false));
  }, [messages, enabled]);

  return {
    analysis,
    isAnalyzing,
    apiError,
    showSpecialistAlert,
    dismissAlert: () => setShowSpecialistAlert(false),
    dismissError: () => setApiError(null),
    setAnalysis,
  };
}
