import type { Decision, ProjectContext, TermDefinition } from '../types';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
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

function isTermDefinition(value: unknown): value is TermDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<TermDefinition>;
  return isNonEmptyString(candidate.term) && isString(candidate.definition);
}

/** Validate project JSON before it reaches sorting, prompts, or UI rendering. */
export function isValidProjectContext(value: unknown): value is ProjectContext {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProjectContext>;
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.name) &&
    isNonEmptyString(candidate.createdAt) &&
    isNonEmptyString(candidate.updatedAt) &&
    isString(candidate.targetUsers) &&
    isString(candidate.coreFeatures) &&
    Array.isArray(candidate.decisions) &&
    candidate.decisions.every(isDecision) &&
    Array.isArray(candidate.terminology) &&
    candidate.terminology.every(isTermDefinition) &&
    Array.isArray(candidate.competitors) &&
    candidate.competitors.every(isNonEmptyString)
  );
}
