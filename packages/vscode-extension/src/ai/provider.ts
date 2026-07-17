/**
 * Remember Me - AI Provider 工厂与管理器
 * 负责 AI 提供商的创建、配置管理、切换和生命周期管理
 */

import * as vscode from 'vscode';
import type { AIProvider, Message, ChatOptions } from '../types';
import { DeepSeekProvider } from './deepseek';
import { QwenProvider } from './qwen';
import { ErnieProvider } from './ernie';
import { ChatGLMProvider } from './chatglm';
import { OllamaProvider } from './ollama';
import { BaseOpenAIProvider, type OpenAIProviderConfig } from './base-openai';
import { getLogger } from '../utils/logger';

/** 支持的 AI 提供商类型 */
export type ProviderType =
  | 'deepseek'
  | 'qwen'
  | 'ernie'
  | 'chatglm'
  | 'ollama'
  | 'lmstudio';

/** 各提供商默认配置映射 */
const PROVIDER_DEFAULTS: Record<
  ProviderType,
  Omit<OpenAIProviderConfig, 'apiKey' | 'baseURL'>
> = {
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  qwen: { name: '通义千问', defaultModel: 'qwen-turbo' },
  ernie: { name: '文心一言', defaultModel: 'ernie-speed' },
  chatglm: { name: '智谱AI', defaultModel: 'glm-4' },
  ollama: { name: 'Ollama', defaultModel: 'llama3.1' },
  lmstudio: { name: 'LM Studio', defaultModel: 'local-model' },
};

/** 各提供商默认基础 URL */
const PROVIDER_BASE_URLS: Record<ProviderType, string | undefined> = {
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ernie: 'https://qianfan.baidubce.com/v2',
  chatglm: 'https://open.bigmodel.cn/api/paas/v4',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

/** Provider 创建时可选覆盖配置 */
export interface ProviderCreateOptions {
  /** API 密钥，默认从 VS Code 配置读取 */
  apiKey?: string;
  /** 自定义 API 基础 URL，默认从 VS Code 配置或提供商预设读取 */
  baseURL?: string;
  /** 覆盖默认模型名称 */
  model?: string;
}

/**
 * AI Provider 工厂函数
 * 根据提供商类型创建对应实例
 */
export function createProvider(
  type: ProviderType,
  options?: ProviderCreateOptions
): AIProvider {
  const vscodeConfig = vscode.workspace.getConfiguration('rememberMe');

  // 优先使用传入配置，其次 VS Code 设置，最后使用提供商预设
  const apiKey =
    options?.apiKey ??
    (vscodeConfig.get<string>('apiKey') || '');
  const baseURL =
    options?.baseURL ??
    vscodeConfig.get<string>('apiBaseUrl') ??
    PROVIDER_BASE_URLS[type];
  const model = options?.model;

  switch (type) {
    case 'deepseek':
      return new DeepSeekProvider(apiKey, baseURL);

    case 'qwen':
      return new QwenProvider(apiKey, baseURL);

    case 'ernie':
      return new ErnieProvider(apiKey, baseURL);

    case 'chatglm':
      return new ChatGLMProvider(apiKey, baseURL);

    case 'ollama':
      return new OllamaProvider(baseURL);

    case 'lmstudio': {
      // LM Studio 使用 OpenAI 兼容接口，复用 BaseOpenAIProvider
      const lmConfig: OpenAIProviderConfig = {
        name: PROVIDER_DEFAULTS.lmstudio.name,
        apiKey: 'lm-studio',
        baseURL: baseURL || PROVIDER_BASE_URLS.lmstudio,
        defaultModel: model || PROVIDER_DEFAULTS.lmstudio.defaultModel,
      };
      return new BaseOpenAIProviderForLMStudio(lmConfig);
    }

    default: {
      // exhaustive check
      const _exhaustive: never = type;
      throw new Error(`不支持的 AI 提供商类型: ${_exhaustive}`);
    }
  }
}

/**
 * 专为 LM Studio 创建的匿名子类
 * 避免在 ollama.ts 中引入耦合
 */
class BaseOpenAIProviderForLMStudio extends BaseOpenAIProvider {}

/**
 * AI Provider 管理器（单例）
 * 负责当前活动 Provider 的生命周期管理
 */
export class AIProviderManager {
  private static instance: AIProviderManager | null = null;
  private currentProvider: AIProvider | null = null;
  private providerType: ProviderType = 'deepseek';

  private constructor() {}

  /** 获取管理器单例 */
  static getInstance(): AIProviderManager {
    if (!AIProviderManager.instance) {
      AIProviderManager.instance = new AIProviderManager();
    }
    return AIProviderManager.instance;
  }

  /**
   * 初始化管理器
   * 读取 VS Code 配置中的默认提供商并创建实例
   */
  async initialize(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('rememberMe');
    const providerType = config.get<ProviderType>('aiProvider', 'deepseek');
    return this.switchProvider(providerType);
  }

  /**
   * 切换到指定提供商
   * @param type - 目标提供商类型
   * @param options - 可选的覆盖配置
   * @returns 切换是否成功（包含配置验证）
   */
  async switchProvider(
    type: ProviderType,
    options?: ProviderCreateOptions
  ): Promise<boolean> {
    try {
      const provider = createProvider(type, options);
      const isValid = await provider.validateConfig();
      if (!isValid) {
        getLogger().warn(`[RememberMe] ${type} 配置验证失败，请检查 API 密钥和连接`);
        return false;
      }
      this.currentProvider = provider;
      this.providerType = type;
      return true;
    } catch (error) {
      getLogger().error(`[RememberMe] 切换 AI 提供商失败: ${type}`, error);
      return false;
    }
  }

  /** 获取当前活动的 Provider */
  getCurrentProvider(): AIProvider | null {
    return this.currentProvider;
  }

  /** 获取当前 Provider 类型 */
  getCurrentProviderType(): ProviderType {
    return this.providerType;
  }

  /** 当前 Provider 是否已就绪 */
  isReady(): boolean {
    return this.currentProvider !== null;
  }

  /**
   * 使用当前 Provider 进行流式对话
   * @throws 如果 Provider 未初始化
   */
  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<string> {
    if (!this.currentProvider) {
      throw new Error(
        'AI 提供商未初始化，请先调用 initialize() 或 switchProvider()'
      );
    }
    yield* this.currentProvider.chat(messages, options);
  }

  /**
   * 验证当前 Provider 配置
   */
  async validateCurrentConfig(): Promise<boolean> {
    if (!this.currentProvider) {
      return false;
    }
    return this.currentProvider.validateConfig();
  }

  /** 获取所有支持的提供商信息 */
  getSupportedProviders(): Array<{
    type: ProviderType;
    name: string;
    defaultModel: string;
    defaultBaseURL: string | undefined;
  }> {
    return (Object.keys(PROVIDER_DEFAULTS) as ProviderType[]).map((type) => ({
      type,
      name: PROVIDER_DEFAULTS[type].name,
      defaultModel: PROVIDER_DEFAULTS[type].defaultModel,
      defaultBaseURL: PROVIDER_BASE_URLS[type],
    }));
  }

  /** 销毁当前 Provider 实例 */
  dispose(): void {
    this.currentProvider = null;
    AIProviderManager.instance = null;
  }
}
