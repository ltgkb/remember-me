/** Privacy-safe diagnostic snapshot and Markdown renderer. */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { JsonStorage } from '../memory/storage';
import type { Conversation, Profile, ProjectContext } from '../types';
import { isValidProfile } from './profileGuard';
import type { SearchMode } from './searchSettings';

export interface DiagnosticRuntime {
  extensionVersion: string;
  vscodeVersion: string;
  provider: string;
  modelConfigured: boolean;
  customBaseUrlConfigured: boolean;
  apiKeyStatus: 'configured' | 'missing' | 'not-required';
  searchMode: SearchMode;
  semanticAvailable: boolean;
  engineHealthy: boolean;
  engineSemanticReady: boolean;
  engineModel?: string;
  generatedAt?: string;
}

export interface DiagnosticSnapshot extends DiagnosticRuntime {
  platform: string;
  storagePath: string;
  storageWritable: boolean;
  profileConfigured: boolean;
  projectCount: number;
  conversationCount: number;
  invalidProjectDirectories: number;
  activeProjectSelected: boolean;
}

export function collectDiagnosticSnapshot(
  storage: JsonStorage,
  runtime: DiagnosticRuntime
): DiagnosticSnapshot {
  let storageWritable = true;
  try {
    fs.accessSync(storage.getBasePath(), fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    storageWritable = false;
  }

  const profile = storage.read<Profile>('profile.json');
  const activeState = storage.read<{ name?: unknown }>('current-project.json');
  let projectCount = 0;
  let conversationCount = 0;
  let invalidProjectDirectories = 0;

  for (const directoryName of storage.listDir('projects')) {
    const context = storage.read<ProjectContext>('projects', directoryName, 'context.json');
    if (!context || typeof context.name !== 'string' || !context.name.trim()) {
      invalidProjectDirectories++;
      continue;
    }
    projectCount++;
    for (const filename of storage.listDir('projects', directoryName, 'conversations')) {
      if (!filename.endsWith('.json')) {
        continue;
      }
      const conversation = storage.read<Conversation>(
        'projects',
        directoryName,
        'conversations',
        filename
      );
      if (conversation?.id) {
        conversationCount++;
      }
    }
  }

  return {
    ...runtime,
    generatedAt: runtime.generatedAt || new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    storagePath: abbreviateHome(storage.getBasePath()),
    storageWritable,
    profileConfigured: isValidProfile(profile),
    projectCount,
    conversationCount,
    invalidProjectDirectories,
    activeProjectSelected:
      typeof activeState?.name === 'string' && Boolean(activeState.name.trim()),
  };
}

export function renderDiagnosticMarkdown(snapshot: DiagnosticSnapshot): string {
  const keyLabel = snapshot.apiKeyStatus === 'configured'
    ? '已配置（值未读取到报告）'
    : snapshot.apiKeyStatus === 'not-required'
      ? '本地提供商无需密钥'
      : '未配置';
  const engineLabel = snapshot.engineHealthy
    ? snapshot.engineSemanticReady ? '已连接，语义能力就绪' : '已连接，语义能力未就绪'
    : '未连接';
  const recommendations: string[] = [];

  if (!snapshot.storageWritable) recommendations.push('检查记忆目录的读写权限。');
  if (!snapshot.profileConfigured) recommendations.push('完成个人画像设置。');
  if (snapshot.apiKeyStatus === 'missing') recommendations.push('安全设置当前云端提供商的 API 密钥。');
  if (!snapshot.engineHealthy && snapshot.searchMode !== 'keyword') {
    recommendations.push('启动 memory-engine，或暂时切换为关键词搜索。');
  }
  if (snapshot.invalidProjectDirectories > 0) {
    recommendations.push('检查并清理缺少有效 context.json 的项目目录。');
  }
  if (recommendations.length === 0) {
    recommendations.push('核心本地配置未发现明显异常；此结果不代表云端模型 API 已连通。');
  }

  return [
    '# Remember Me 诊断报告',
    '',
    '> 本报告不包含 API 密钥、个人画像正文、项目正文或对话正文。分享前仍请检查本机路径信息。',
    '',
    '## 运行环境',
    '',
    `- 扩展版本：${snapshot.extensionVersion}`,
    `- VS Code：${snapshot.vscodeVersion}`,
    `- 平台：${snapshot.platform}`,
    `- 生成时间：${snapshot.generatedAt}`,
    '',
    '## 本地数据',
    '',
    `- 存储目录：\`${snapshot.storagePath}\``,
    `- 目录读写：${snapshot.storageWritable ? '正常' : '异常'}`,
    `- 个人画像：${snapshot.profileConfigured ? '已配置' : '未配置或无效'}`,
    `- 有效项目：${snapshot.projectCount}`,
    `- 对话记录：${snapshot.conversationCount}`,
    `- 无效项目目录：${snapshot.invalidProjectDirectories}`,
    `- 当前项目：${snapshot.activeProjectSelected ? '已选择（名称未写入报告）' : '未选择'}`,
    '',
    '## AI 与搜索',
    '',
    `- AI 提供商：${snapshot.provider}`,
    `- 自定义模型：${snapshot.modelConfigured ? '已配置（名称未写入报告）' : '未配置'}`,
    `- 自定义 API 地址：${snapshot.customBaseUrlConfigured ? '已配置（地址未写入报告）' : '未配置'}`,
    `- API 密钥：${keyLabel}`,
    `- 搜索模式：${snapshot.searchMode}`,
    `- 记录的语义可用性：${snapshot.semanticAvailable ? '可用' : '不可用'}`,
    `- memory-engine：${engineLabel}`,
    `- 已加载语义模型：${snapshot.engineModel || '无'}`,
    '',
    '## 建议',
    '',
    ...recommendations.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function abbreviateHome(value: string): string {
  const home = path.resolve(os.homedir());
  const resolved = path.resolve(value);
  return resolved === home
    ? '~'
    : resolved.startsWith(`${home}${path.sep}`)
      ? `~${path.sep}${path.relative(home, resolved)}`
      : resolved;
}
