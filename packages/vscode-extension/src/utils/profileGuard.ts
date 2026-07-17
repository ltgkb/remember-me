import type { Profile } from '../types';

/**
 * 校验 profile 是否包含完整且合法的 identity / style
 */
export function isValidProfile(profile: Profile | null | undefined): profile is Profile {
  if (!profile) {
    return false;
  }
  const identity = profile.identity;
  const style = profile.style;
  if (!identity || !style) {
    return false;
  }
  return (
    typeof identity.role === 'string' && identity.role.length > 0 &&
    typeof identity.experience === 'string' &&
    typeof identity.industry === 'string' &&
    typeof identity.background === 'string' &&
    typeof style.documentStructure === 'string' &&
    typeof style.detailLevel === 'string' &&
    typeof style.language === 'string' &&
    typeof style.tone === 'string' &&
    typeof style.responseStyle === 'string' &&
    Array.isArray(style.specialHabits)
  );
}

/**
 * 获取可用于展示的角色标签，数据不完整时返回兜底文本
 */
export function getRoleLabel(profile: Profile | null | undefined): string {
  if (isValidProfile(profile)) {
    return profile.identity.role;
  }
  return '未设置';
}
