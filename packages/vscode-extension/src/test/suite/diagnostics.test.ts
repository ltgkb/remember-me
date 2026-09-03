/**
 * Remember Me - privacy-safe diagnostics tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonStorage } from '../../memory/storage';
import {
  collectDiagnosticSnapshot,
  renderDiagnosticMarkdown,
  type DiagnosticRuntime,
} from '../../utils/diagnostics';

const runtime: DiagnosticRuntime = {
  extensionVersion: '0.4.0-test',
  vscodeVersion: '1.130.0',
  provider: 'deepseek',
  modelConfigured: true,
  customBaseUrlConfigured: true,
  apiKeyStatus: 'configured',
  searchMode: 'hybrid',
  semanticAvailable: false,
  engineHealthy: false,
  engineSemanticReady: false,
  generatedAt: '2026-09-03T00:00:00.000Z',
};

describe('Remember Me diagnostics', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-diagnostics-test-'));
    storage = new JsonStorage({ basePath: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('只统计有效项目和可读取的对话', () => {
    storage.write(
      {
        id: 'project-1', name: 'TeamFlow', createdAt: runtime.generatedAt,
        updatedAt: runtime.generatedAt, targetUsers: '团队', coreFeatures: '协作',
        decisions: [], terminology: [], competitors: [],
      },
      'projects', 'teamflow', 'context.json'
    );
    storage.write(
      {
        id: 'conversation-1', title: '讨论', createdAt: runtime.generatedAt,
        updatedAt: runtime.generatedAt, messages: [], keyDecisions: [], insights: [], tags: [],
      },
      'projects', 'teamflow', 'conversations', 'one.json'
    );
    storage.write([], 'projects', 'stale', 'conversations', '.gitkeep');

    const snapshot = collectDiagnosticSnapshot(storage, runtime);

    assert.strictEqual(snapshot.projectCount, 1);
    assert.strictEqual(snapshot.conversationCount, 1);
    assert.strictEqual(snapshot.invalidProjectDirectories, 1);
  });

  it('报告不应包含密钥、模型名、自定义地址或记忆正文', () => {
    storage.write({ name: 'Secret Project' }, 'current-project.json');
    const report = renderDiagnosticMarkdown(collectDiagnosticSnapshot(storage, runtime));

    assert.ok(report.includes('值未读取到报告'));
    assert.ok(report.includes('名称未写入报告'));
    assert.ok(report.includes('地址未写入报告'));
    assert.ok(!report.includes('Secret Project'));
    assert.ok(!report.includes('sk-secret-value'));
  });
});
