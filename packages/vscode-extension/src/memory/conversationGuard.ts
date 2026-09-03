import type { ChatMessage, Conversation, Decision, Insight } from '../types';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ChatMessage>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    isString(candidate.content) &&
    isNonEmptyString(candidate.timestamp)
  );
}

function isDecision(value: unknown): value is Decision {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Decision>;
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.title) &&
    isString(candidate.description) &&
    isNonEmptyString(candidate.createdAt) &&
    ['已确定', '待确认', '已废弃'].includes(candidate.status ?? '')
  );
}

function isInsight(value: unknown): value is Insight {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Insight>;
  return (
    isNonEmptyString(candidate.id) &&
    isString(candidate.content) &&
    isNonEmptyString(candidate.createdAt) &&
    ['决策', '发现', '修改'].includes(candidate.category ?? '')
  );
}

/** Validate conversation JSON before search, sorting, or prompt construction. */
export function isValidConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Conversation>;
  return (
    isNonEmptyString(candidate.id) &&
    isString(candidate.title) &&
    isNonEmptyString(candidate.createdAt) &&
    isNonEmptyString(candidate.updatedAt) &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isMessage) &&
    Array.isArray(candidate.keyDecisions) &&
    candidate.keyDecisions.every(isDecision) &&
    Array.isArray(candidate.insights) &&
    candidate.insights.every(isInsight) &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every(isString)
  );
}
