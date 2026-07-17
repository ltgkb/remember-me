/**
 * Remember Me - 日志系统
 * 封装 VS Code OutputChannel，替代 console.* 调用
 */

import * as vscode from 'vscode';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志器类（单例模式）
 * 封装 VS Code OutputChannel，支持级别过滤和开发模式
 */
class Logger {
  private static instance: Logger | null = null;
  private outputChannel: vscode.OutputChannel | null = null;
  private level: LogLevel;
  private prefix: string;
  private devMode: boolean;

  /**
   * 私有构造函数，确保单例
   */
  private constructor() {
    this.level = LogLevel.INFO;
    this.prefix = 'Remember Me';
    this.devMode = false;

    // 尝试创建 VS Code 输出通道，如果 API 不可用则降级到 console
    if (
      vscode.window &&
      typeof vscode.window.createOutputChannel === 'function'
    ) {
      try {
        this.outputChannel = vscode.window.createOutputChannel(this.prefix);
      } catch {
        this.outputChannel = null;
      }
    }
  }

  /**
   * 获取 Logger 单例实例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: string, message: string): string {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').slice(0, 19);
    return `[${ts}] [${level}] ${message}`;
  }

  /**
   * 内部日志输出方法
   */
  private log(
    level: LogLevel,
    levelLabel: string,
    message: string,
    args: unknown[]
  ): void {
    if (level < this.level) {
      return;
    }

    let output = this.formatMessage(levelLabel, message);
    if (args.length > 0) {
      const argStr = args
        .map((a) =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        )
        .join(' ');
      output += ` ${argStr}`;
    }

    if (this.outputChannel) {
      this.outputChannel.appendLine(output);
    }

    if (this.devMode || !this.outputChannel) {
      // 根据级别选择对应的 console 方法
      if (level >= LogLevel.ERROR) {
        console.error(output);
      } else if (level >= LogLevel.WARN) {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
  }

  /**
   * 输出 DEBUG 级别日志
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, args);
  }

  /**
   * 输出 INFO 级别日志
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, 'INFO', message, args);
  }

  /**
   * 输出 WARN 级别日志
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, 'WARN', message, args);
  }

  /**
   * 输出 ERROR 级别日志
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, 'ERROR', message, args);
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 设置开发模式（同时输出到控制台）
   */
  setDevMode(enabled: boolean): void {
    this.devMode = enabled;
  }

  /**
   * 在 VS Code 输出面板中显示日志通道
   */
  show(): void {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }

  /**
   * 释放资源并重置单例
   */
  dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
    Logger.instance = null;
  }
}

// 便捷导出：全局使用 Logger 类
export { Logger };

/**
 * 便捷函数：返回 Logger 单例
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}
