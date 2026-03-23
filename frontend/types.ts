export enum Role {
  USER = 'user',
  AGENT = 'assistant',
  SYSTEM = 'system'
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

export enum TagType {
  ORDER = '訂單',
  LOGISTICS = '物流',
  HEALTH = '健康',
  CANCEL = '取消',
  COMPLAINT = '抱怨',
  PAYMENT = '付款',
  OTHER = '其他'
}

export enum Sentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
  ANGRY = 'angry'
}

export enum RoutingAction {
  NONE = 'none',
  DIETITIAN = 'dietitian',
  SENIOR_AGENT = 'senior_agent',
  RISK_ALERT = 'risk_alert'
}

export interface ConversationAnalysis {
  tags: TagType[];
  sentiment: Sentiment;
  routing: RoutingAction;
  suggestedReply: string;
  upsellOpportunity: {
    detected: boolean;
    suggestion: string;
  };
  reasoning: string; // Why the AI made these decisions
}

export interface ChartData {
  name: string;
  value: number;
}
