/**
 * Remember Me - JSON 存储层
 * 纯 JSON 文件存储，零依赖
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { StorageConfig } from '../types';
import { getLogger } from '../utils/logger';

type WriteListener = (relativePath: string) => void;

export class JsonStorage {
  private readonly basePath: string;
  private readonly baseRealPath: string;
  private readonly writeListeners = new Set<WriteListener>();

  constructor(config?: StorageConfig) {
    this.basePath = path.resolve(config?.basePath || path.join(os.homedir(), '.remember-me'));
    this.ensureDir(this.basePath);
    this.baseRealPath = fs.realpathSync(this.basePath);
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

  /**
   * Resolve a path inside the storage root.
   *
   * JsonStorage receives some path fragments derived from imported files and UI
   * messages. Rejecting absolute paths and parent traversal here keeps every
   * caller inside ~/.remember-me even if an upstream validation is missed.
   */
  private resolvePath(...segments: string[]): string {
    if (segments.length === 0 || segments.some((segment) => !segment || path.isAbsolute(segment))) {
      throw new Error('存储路径无效');
    }

    const fullPath = path.resolve(this.basePath, ...segments);
    const relative = path.relative(this.basePath, fullPath);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('存储路径不能超出 Remember Me 数据目录');
    }

    // Resolve the nearest existing ancestor as well, otherwise a symlink inside
    // the storage root could redirect a seemingly safe path outside it.
    let existingAncestor = fullPath;
    while (!fs.existsSync(existingAncestor) && existingAncestor !== this.basePath) {
      existingAncestor = path.dirname(existingAncestor);
    }
    const ancestorRealPath = fs.realpathSync(existingAncestor);
    const realRelative = path.relative(this.baseRealPath, ancestorRealPath);
    if (
      realRelative.startsWith(`..${path.sep}`) ||
      realRelative === '..' ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error('存储路径不能通过符号链接超出 Remember Me 数据目录');
    }
    return fullPath;
  }

  private notifyWrite(pathSegments: string[]): void {
    const relativePath = pathSegments.join('/');
    for (const listener of this.writeListeners) {
      try {
        listener(relativePath);
      } catch (error) {
        getLogger().warn(`[RememberMe] 写入监听器执行失败: ${relativePath}`, error);
      }
    }
  }

  /** Register a listener for successful writes. Returns an unsubscribe function. */
  onDidWrite(listener: WriteListener): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
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
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      this.ensureDir(path.dirname(filePath));
      // Same-directory temporary file + rename prevents a crash from leaving a
      // partially written JSON document. Restrictive permissions protect new
      // memory files on multi-user systems.
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.renameSync(tempPath, filePath);
      this.notifyWrite(pathSegments);
      return true;
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Best-effort cleanup; preserve the original write error.
      }
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
