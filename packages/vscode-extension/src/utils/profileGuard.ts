import type { Profile } from '../types';

const allowedValues = {
  role: new Set(['产品经理', '运营', '设计师', '学生', '创业者', '管理者', '其他']),
  experience: new Set(['新手', '1-3年', '3-5年', '5年以上']),
  industry: new Set(['电商', 'SaaS', '社交', '金融', '教育', '医疗', '其他']),
  background: new Set(['技术', '商业', '设计', '文科', '其他']),
  documentStructure: new Set(['先背景后功能', '先功能后背景', '自由结构']),
  detailLevel: new Set(['简洁（1页）', '标准（3-5页）', '详尽（10页以上）']),
  language: new Set(['中文', '英文', '双语']),
  tone: new Set(['正式', '口语化', '学术']),
  responseStyle: new Set(['先框架再细节', '直接完整内容', '逐步引导']),
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 校验 profile 是否包含完整且合法的 identity / style
 */
export function isValidProfile(profile: unknown): profile is Profile {
  if (!profile || typeof profile !== 'object') {
    return false;
  }
  const candidate = profile as Partial<Profile>;
  const identity = candidate.identity;
  const style = candidate.style;
  if (!identity || typeof identity !== 'object' || !style || typeof style !== 'object') {
    return false;
  }
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.createdAt) &&
    isNonEmptyString(candidate.updatedAt) &&
    allowedValues.role.has(identity.role) &&
    allowedValues.experience.has(identity.experience) &&
    allowedValues.industry.has(identity.industry) &&
    allowedValues.background.has(identity.background) &&
    allowedValues.documentStructure.has(style.documentStructure) &&
    allowedValues.detailLevel.has(style.detailLevel) &&
    allowedValues.language.has(style.language) &&
    allowedValues.tone.has(style.tone) &&
    allowedValues.responseStyle.has(style.responseStyle) &&
    Array.isArray(style.specialHabits) &&
    style.specialHabits.every(isNonEmptyString)
  );
}

/**
 * 获取可用于展示的角色标签，数据不完整时返回兜底文本
 */
export function getRoleLabel(profile: unknown): string {
  if (isValidProfile(profile)) {
    return profile.identity.role;
  }
  return '未设置';
}
