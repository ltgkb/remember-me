/**
 * Remember Me - SettingsPanel project creation regression tests
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { JsonStorage } from '../../memory/storage';
import { SettingsPanelWebview } from '../../ui/webview/settingsPanel';

describe('SettingsPanelWebview project creation', () => {
  let tempDir: string;
  let storage: JsonStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remember-me-settings-test-'));
    storage = new JsonStorage({ basePath: tempDir });
    SettingsPanelWebview.createOrShow(vscode.Uri.file(tempDir), storage, 'project');
  });

  afterEach(() => {
    SettingsPanelWebview.currentPanel?.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('应通过 ProjectManager 规范化目录名并保存竞品', async () => {
    const panel = SettingsPanelWebview.currentPanel as unknown as {
      saveProject(data: Record<string, unknown>): Promise<void>;
    };

    await panel.saveProject({
      name: 'Team / Alpha',
      targetUsers: '团队管理员',
      coreFeatures: '协作',
      competitors: 'Slack，飞书, Slack',
    });

    const project = storage.read<{ name: string; competitors: string[] }>(
      'projects',
      'team-alpha',
      'context.json'
    );
    assert.strictEqual(project?.name, 'Team / Alpha');
    assert.deepStrictEqual(project?.competitors, ['Slack', '飞书']);
  });

  it('重复创建不应覆盖已有项目记忆', async () => {
    const panel = SettingsPanelWebview.currentPanel as unknown as {
      saveProject(data: Record<string, unknown>): Promise<void>;
    };
    const initial = {
      name: 'TeamFlow',
      targetUsers: '原用户',
      coreFeatures: '原功能',
      competitors: 'Slack',
    };

    await panel.saveProject(initial);
    await panel.saveProject({
      ...initial,
      targetUsers: '被覆盖的用户',
      coreFeatures: '被覆盖的功能',
    });

    const project = storage.read<{ targetUsers: string; coreFeatures: string }>(
      'projects',
      'teamflow',
      'context.json'
    );
    assert.strictEqual(project?.targetUsers, '原用户');
    assert.strictEqual(project?.coreFeatures, '原功能');
  });
});
