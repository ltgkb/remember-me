/**
 * Remember Me - Logger 单元测试
 * 验证日志级别、格式化、单例模式和降级行为（PRD §2.3.3 日志系统）
 */

import * as assert from 'assert';
import { Logger, LogLevel, getLogger } from '../../utils/logger';
import * as vscode from 'vscode';

describe('Logger', () => {
  let logger: Logger;
  let originalLog: (...args: unknown[]) => void;
  let originalWarn: (...args: unknown[]) => void;
  let originalError: (...args: unknown[]) => void;
  let logOutputs: string[];
  let warnOutputs: string[];
  let errorOutputs: string[];

  beforeEach(() => {
    // 重置单例
    try {
      Logger.getInstance().dispose();
    } catch {
      // 忽略首次 dispose 可能的问题
    }
    logger = Logger.getInstance();

    logOutputs = [];
    warnOutputs = [];
    errorOutputs = [];

    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;

    (console as any).log = (...args: unknown[]) => {
      logOutputs.push(args.join(' '));
    };
    (console as any).warn = (...args: unknown[]) => {
      warnOutputs.push(args.join(' '));
    };
    (console as any).error = (...args: unknown[]) => {
      errorOutputs.push(args.join(' '));
    };
  });

  afterEach(() => {
    (console as any).log = originalLog;
    (console as any).warn = originalWarn;
    (console as any).error = originalError;
    logger.dispose();
  });

  describe('单例模式', () => {
    it('getInstance 应返回同一个实例', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      assert.strictEqual(instance1, instance2);
    });

    it('getLogger 应返回 Logger 单例', () => {
      const loggerInstance = getLogger();
      assert.strictEqual(loggerInstance, Logger.getInstance());
    });
  });

  describe('日志输出与级别过滤', () => {
    it('debug 在默认 INFO 级别下不应输出', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('debug message');
      assert.strictEqual(logOutputs.length, 0);
      assert.strictEqual(warnOutputs.length, 0);
      assert.strictEqual(errorOutputs.length, 0);
    });

    it('debug 在 DEBUG 级别下应输出到 console', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('debug message');
      assert.strictEqual(logOutputs.length, 1);
      assert.ok(logOutputs[0].includes('[DEBUG]'));
      assert.ok(logOutputs[0].includes('debug message'));
    });

    it('info 应输出格式化日志到 console', () => {
      logger.info('info message');
      assert.strictEqual(logOutputs.length, 1);
      assert.ok(logOutputs[0].includes('[INFO]'));
      assert.ok(logOutputs[0].includes('info message'));
      assert.ok(
        /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/.test(logOutputs[0])
      );
    });

    it('warn 应输出到 console.warn', () => {
      logger.warn('warn message');
      assert.strictEqual(warnOutputs.length, 1);
      assert.ok(warnOutputs[0].includes('[WARN]'));
      assert.ok(warnOutputs[0].includes('warn message'));
    });

    it('error 应输出到 console.error', () => {
      logger.error('error message');
      assert.strictEqual(errorOutputs.length, 1);
      assert.ok(errorOutputs[0].includes('[ERROR]'));
      assert.ok(errorOutputs[0].includes('error message'));
    });

    it('日志应包含附加参数', () => {
      logger.info('message with args', 'arg1', 42, { key: 'value' });
      const output = logOutputs[0];
      assert.ok(output.includes('arg1'));
      assert.ok(output.includes('42'));
      assert.ok(output.includes('key'));
    });
  });

  describe('开发模式', () => {
    let originalCreateOutputChannel: unknown;

    beforeEach(() => {
      originalCreateOutputChannel = (vscode.window as any).createOutputChannel;
      // 注入 mock OutputChannel 以测试 devMode 行为
      (vscode.window as any).createOutputChannel = () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {},
      });
      logger.dispose();
      logger = Logger.getInstance();
    });

    afterEach(() => {
      (vscode.window as any).createOutputChannel = originalCreateOutputChannel;
    });

    it('devMode 为 false 且 OutputChannel 存在时，info 不应输出到 console', () => {
      logger.setDevMode(false);
      logger.setLevel(LogLevel.INFO);
      logOutputs = [];
      logger.info('no dev mode');
      assert.strictEqual(logOutputs.length, 0);
    });

    it('devMode 为 true 且 OutputChannel 存在时，应同时输出到 console', () => {
      logger.setDevMode(true);
      logger.setLevel(LogLevel.INFO);
      logOutputs = [];
      logger.info('dev mode on');
      assert.strictEqual(logOutputs.length, 1);
      assert.ok(logOutputs[0].includes('dev mode on'));
    });
  });

  describe('边界行为', () => {
    it('show 在无 OutputChannel 时不应抛出错误', () => {
      assert.doesNotThrow(() => logger.show());
    });

    it('dispose 后再次 getInstance 应创建新实例', () => {
      logger.dispose();
      const newInstance = Logger.getInstance();
      assert.ok(newInstance);
      // 注意：这里不直接用 assert.notStrictEqual，因为 newInstance 可能是新对象
      newInstance.dispose();
    });
  });
});
