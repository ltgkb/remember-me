/**
 * Remember Me - DeepSeek 适配器
 * 基于 OpenAI 兼容 API
 * 官网: https://platform.deepseek.com/
 */

import { BaseOpenAIProvider } from './base-openai';
import type { OpenAIProviderConfig } from './base-openai';

export class DeepSeekProvider extends BaseOpenAIProvider {
  constructor(apiKey: string, baseURL?: string) {
    const config: OpenAIProviderConfig = {
      name: 'DeepSeek',
      apiKey,
      baseURL: baseURL || 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
    };
    super(config);
  }
}
