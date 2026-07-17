/**
 * Remember Me - 通义千问 (Qwen) 适配器
 * 基于 DashScope OpenAI 兼容 API
 * 官网: https://dashscope.aliyun.com/
 */

import { BaseOpenAIProvider } from './base-openai';
import type { OpenAIProviderConfig } from './base-openai';

export class QwenProvider extends BaseOpenAIProvider {
  constructor(apiKey: string, baseURL?: string) {
    const config: OpenAIProviderConfig = {
      name: '通义千问',
      apiKey,
      baseURL: baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-turbo',
    };
    super(config);
  }
}
