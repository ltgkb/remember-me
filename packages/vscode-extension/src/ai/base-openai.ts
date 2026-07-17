/**
 * Remember Me - OpenAI 兼容 API 基础适配器
 * 所有使用 OpenAI 兼容接口的 AI 提供商均可继承此类
 */

import OpenAI from 'openai';
import type { Message, ChatOptions, AIProvider } from '../types';

export interface OpenAIProviderConfig {
  /** 提供商显示名称 */
  readonly name: string;
  /** API 密钥 */
  readonly apiKey: string;
  /** 自定义 API 基础 URL */
  readonly baseURL?: string;
  /** 默认模型名称 */
  readonly defaultModel: string;
}

/**
 * OpenAI 兼容 API 基础适配器
 * 支持流式输出 (SSE) 和标准 Chat Completion
 */
export abstract class BaseOpenAIProvider implements AIProvider {
  protected readonly client: OpenAI;
  readonly name: string;
  protected readonly defaultModel: string;

  constructor(config: OpenAIProviderConfig) {
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      // 禁用默认超时，由调用方控制
      timeout: 60 * 1000,
    });
  }

  /**
   * 流式对话接口
   * @param messages - 消息列表
   * @param options - 可选参数（temperature、maxTokens、model 等）
   */
  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<string> {
    const model = options?.model || this.defaultModel;

    const stream = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        yield content;
      }
    }
  }

  /**
   * 非流式对话接口（辅助方法）
   * @param messages - 消息列表
   * @param options - 可选参数
   */
  async chatComplete(
    messages: Message[],
    options?: ChatOptions
  ): Promise<string> {
    const model = options?.model || this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
      stream: false,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * 验证当前配置是否可用
   * 通过调用 models.list() 检查 API 连通性
   */
  async validateConfig(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
