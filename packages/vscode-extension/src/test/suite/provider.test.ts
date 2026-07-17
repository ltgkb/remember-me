/**
 * Remember Me - AI Provider 单元测试
 * 验证 Provider 配置、工厂函数和管理器基础功能（PRD §3.3 AI 提供商支持）
 */

import * as assert from 'assert';
import {
  createProvider,
  AIProviderManager,
  type ProviderType,
} from '../../ai/provider';
import { DeepSeekProvider } from '../../ai/deepseek';
import { QwenProvider } from '../../ai/qwen';
import { ErnieProvider } from '../../ai/ernie';
import { ChatGLMProvider } from '../../ai/chatglm';
import { OllamaProvider } from '../../ai/ollama';

describe('AI Provider', () => {
  describe('createProvider', () => {
    it('deepseek 应创建 DeepSeekProvider', () => {
      const provider = createProvider('deepseek', { apiKey: 'test-key' });
      assert.ok(provider instanceof DeepSeekProvider);
      assert.strictEqual(provider.name, 'DeepSeek');
    });

    it('qwen 应创建 QwenProvider', () => {
      const provider = createProvider('qwen', { apiKey: 'test-key' });
      assert.ok(provider instanceof QwenProvider);
      assert.strictEqual(provider.name, '通义千问');
    });

    it('ernie 应创建 ErnieProvider', () => {
      const provider = createProvider('ernie', { apiKey: 'test-key' });
      assert.ok(provider instanceof ErnieProvider);
      assert.strictEqual(provider.name, '文心一言');
    });

    it('chatglm 应创建 ChatGLMProvider', () => {
      const provider = createProvider('chatglm', { apiKey: 'test-key' });
      assert.ok(provider instanceof ChatGLMProvider);
      assert.strictEqual(provider.name, '智谱AI');
    });

    it('ollama 应创建 OllamaProvider', () => {
      const provider = createProvider('ollama');
      assert.ok(provider instanceof OllamaProvider);
      assert.strictEqual(provider.name, 'Ollama');
    });

    it('lmstudio 应创建有效的 Provider', () => {
      const provider = createProvider('lmstudio');
      assert.strictEqual(provider.name, 'LM Studio');
    });

    it('应使用自定义 baseURL', () => {
      const customUrl = 'https://custom.api.com/v1';
      const provider = createProvider('deepseek', {
        apiKey: 'key',
        baseURL: customUrl,
      });
      assert.ok(provider);
    });

    it('所有支持的类型应能创建 Provider', () => {
      const types: ProviderType[] = [
        'deepseek',
        'qwen',
        'ernie',
        'chatglm',
        'ollama',
        'lmstudio',
      ];
      for (const t of types) {
        const opts = t === 'ollama' || t === 'lmstudio' ? {} : { apiKey: 'k' };
        const p = createProvider(t, opts);
        assert.ok(p, `${t} 应能创建 Provider`);
        assert.ok(p.name, `${t} 应有名称`);
      }
    });
  });

  describe('AIProviderManager', () => {
    it('应为单例模式', () => {
      const m1 = AIProviderManager.getInstance();
      const m2 = AIProviderManager.getInstance();
      assert.strictEqual(m1, m2);
    });

    it('初始状态应未就绪', () => {
      const manager = AIProviderManager.getInstance();
      assert.strictEqual(manager.isReady(), false);
    });

    it('getSupportedProviders 应返回所有支持的提供商', () => {
      const manager = AIProviderManager.getInstance();
      const providers = manager.getSupportedProviders();
      const types = providers.map((p) => p.type);
      const expected: ProviderType[] = [
        'deepseek',
        'qwen',
        'ernie',
        'chatglm',
        'ollama',
        'lmstudio',
      ];
      for (const t of expected) {
        assert.ok(types.includes(t), `应支持 ${t}`);
      }
    });

    it('dispose 后应重置状态', () => {
      const manager = AIProviderManager.getInstance();
      manager.dispose();
      assert.strictEqual(manager.isReady(), false);
    });
  });
});
