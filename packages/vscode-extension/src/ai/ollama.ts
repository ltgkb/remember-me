/**
 * Remember Me - Ollama 本地模型适配器
 * 基于 OpenAI 兼容 API
 * 官网: https://ollama.com/
 * 默认端点: http://localhost:11434/v1
 */

import { BaseOpenAIProvider } from './base-openai';
import type { OpenAIProviderConfig } from './base-openai';

export class OllamaProvider extends BaseOpenAIProvider {
  constructor(baseURL?: string) {
    const config: OpenAIProviderConfig = {
      name: 'Ollama',
      // Ollama 本地 API 不需要真实的 API key，但 openai 库要求非空字符串
      apiKey: 'ollama',
      baseURL: baseURL || 'http://localhost:11434/v1',
      defaultModel: 'llama3.1',
    };
    super(config);
  }
}
