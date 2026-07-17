/**
 * Remember Me - JSON 存储层
 * 纯 JSON 文件存储，零依赖
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { StorageConfig, WriteMode } from '../types';
import { getLogger } from '../utils/logger';

export class JsonStorage {
  private basePath: string;

  constructor(config?: StorageConfig) {
    this.basePath = config?.basePath || path.join(os.homedir(), '.remember-me');
    this.ensureDir(this.basePath);
  }

  getBasePath(): string {
    return this.basePath;
  }

  // ========== 目录操作 ==========

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private resolvePath(...segments: string[]): string {
    const fullPath = path.join(this.basePath, ...segments);
    const dir = path.dirname(fullPath);
    this.ensureDir(dir);
    return fullPath;
  }

  // ========== 读写操作 ==========

  read<T>(...pathSegments: string[]): T | null {
    const filePath = this.resolvePath(...pathSegments);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      getLogger().error(`[RememberMe] 读取文件失败: ${filePath}`, error);
      return null;
    }
  }

  write(data: unknown, ...pathSegments: string[]): boolean {
    const filePath = this.resolvePath(...pathSegments);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      getLogger().error(`[RememberMe] 写入文件失败: ${filePath}`, error);
      return false;
    }
  }

  merge<T extends Record<string, unknown>>(data: Partial<T>, ...pathSegments: string[]): T | null {
    const existing = this.read<T>(...pathSegments);
    const merged = existing ? { ...existing, ...data } : (data as T);
    const success = this.write(merged, ...pathSegments);
    return success ? merged : null;
  }

  exists(...pathSegments: string[]): boolean {
    const filePath = this.resolvePath(...pathSegments);
    return fs.existsSync(filePath);
  }

  delete(...pathSegments: string[]): boolean {
    const filePath = this.resolvePath(...pathSegments);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          // 目录需递归删除：fs.unlinkSync 仅能删文件，Windows 下会抛 EPERM
          // Node >= 14.14 提供 fs.rmSync；旧版本降级到 fs.rmdirSync
          if (typeof fs.rmSync === 'function') {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.rmdirSync(filePath, { recursive: true });
          }
        } else {
          fs.unlinkSync(filePath);
        }
      }
      return true;
    } catch (error) {
      getLogger().error(`[RememberMe] 删除失败: ${filePath}`, error);
      return false;
    }
  }

  // ========== 列表操作 ==========

  listDir(...pathSegments: string[]): string[] {
    const dirPath = this.resolvePath(...pathSegments);
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    try {
      return fs.readdirSync(dirPath);
    } catch {
      return [];
    }
  }

  readAllInDir<T>(...pathSegments: string[]): Array<{ name: string; data: T }> {
    const dirPath = this.resolvePath(...pathSegments);
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    return files.map(file => {
      const data = this.read<T>(...pathSegments, file);
      return { name: file.replace('.json', ''), data: data as T };
    }).filter(item => item.data !== null);
  }

  // ========== 版本控制 ==========

  backup(...pathSegments: string[]): boolean {
    const filePath = this.resolvePath(...pathSegments);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(path.dirname(filePath), '.backups');
    this.ensureDir(backupDir);
    const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}`);
    try {
      fs.copyFileSync(filePath, backupPath);
      // 清理旧备份，只保留最近20个
      this.cleanupOldBackups(backupDir, 20);
      return true;
    } catch (error) {
      getLogger().error(`[RememberMe] 备份失败: ${filePath}`, error);
      return false;
    }
  }

  private cleanupOldBackups(backupDir: string, keepCount: number): void {
    try {
      const files = fs.readdirSync(backupDir)
        .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
      
      files.slice(keepCount).forEach(f => {
        fs.unlinkSync(path.join(backupDir, f.name));
      });
    } catch {
      // 静默处理清理错误
    }
  }
}

// 单例导出
let storageInstance: JsonStorage | null = null;

export function getStorage(config?: StorageConfig): JsonStorage {
  if (!storageInstance) {
    storageInstance = new JsonStorage(config);
  }
  return storageInstance;
}
