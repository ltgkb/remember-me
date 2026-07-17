/**
 * Remember Me - 文心一言 (ERNIE) 适配器
 * 基于百度千帆 OpenAI 兼容 API (v2)
 * 官网: https://qianfan.cloud.baidu.com/
 */

import { BaseOpenAIProvider } from './base-openai';
import type { OpenAIProviderConfig } from './base-openai';

export class ErnieProvider extends BaseOpenAIProvider {
  constructor(apiKey: string, baseURL?: string) {
    const config: OpenAIProviderConfig = {
      name: '文心一言',
      apiKey,
      baseURL: baseURL || 'https://qianfan.baidubce.com/v2',
      defaultModel: 'ernie-speed',
    };
    super(config);
  }
}
