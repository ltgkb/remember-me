/**
 * Remember Me - 智谱 AI (ChatGLM) 适配器
 * 基于 OpenAI 兼容 API
 * 官网: https://open.bigmodel.cn/
 */

import { BaseOpenAIProvider } from './base-openai';
import type { OpenAIProviderConfig } from './base-openai';

export class ChatGLMProvider extends BaseOpenAIProvider {
  constructor(apiKey: string, baseURL?: string) {
    const config: OpenAIProviderConfig = {
      name: '智谱AI',
      apiKey,
      baseURL: baseURL || 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4',
    };
    super(config);
  }
}
