/**
 * Remember Me - 测试运行器
 * 使用 Mocha 运行所有测试套件，注入 VS Code API Mock 以支持纯 Node 环境测试
 */

import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';
import Module from 'module';

// ── VS Code API Mock（供不依赖真实 VS Code 运行时的单元测试使用）──
const vscodeMock = {
  workspace: {
    getConfiguration: () => ({
      get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
      update: () => Promise.resolve(),
    }),
  },
  window: {
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      command: '',
      show: (): void => {},
      dispose: (): void => {},
      backgroundColor: undefined,
    }),
    createWebviewPanel: () => ({
      webview: { html: '', postMessage: () => Promise.resolve(), onDidReceiveMessage: () => ({}) },
      onDidDispose: () => ({ dispose: () => {} }),
      reveal: (): void => {},
      dispose: (): void => {},
    }),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    activeTextEditor: undefined,
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, path: p, toString: () => p }),
    parse: (p: string) => ({ fsPath: p, path: p, toString: () => p }),
  },
  ViewColumn: { One: 1, Two: 2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class ThemeIcon {
    constructor() {}
  },
  EventEmitter: class EventEmitter<T> {
    event = () => ({ dispose: (): void => {} });
    fire(_data?: T): void {}
  },
  TreeItem: class TreeItem {
    command?: unknown;
    iconPath?: unknown;
    tooltip?: unknown;
    constructor(_label: string, _collapsibleState?: number) {}
  },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  commands: {
    executeCommand: () => Promise.resolve(),
    registerCommand: () => ({ dispose: (): void => {} }),
  },
  env: { clipboard: { writeText: () => Promise.resolve() } },
  Disposable: { from: () => ({ dispose: (): void => {} }) },
  ExtensionContext: class {},
};

// 注入 vscode mock，使不依赖真实 VS Code 的模块可在纯 Node 环境中测试
const originalLoad = (Module as any)._load.bind(Module);
(Module as any)._load = function (
  request: string,
  parent: NodeModule,
  isMain: boolean
): unknown {
  if (request === 'vscode') {
    return vscodeMock;
  }
  return originalLoad(request, parent, isMain);
};

// ── 配置并运行 Mocha ──
const mocha = new Mocha({
  ui: 'bdd',
  color: true,
  timeout: 10000,
  reporter: 'spec',
});

const testDir = path.join(__dirname, 'suite');

if (!fs.existsSync(testDir)) {
  console.error(`测试目录不存在: ${testDir}`);
  process.exit(1);
}

const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'));

if (testFiles.length === 0) {
  console.error('未找到测试文件');
  process.exit(1);
}

testFiles.forEach((f) => mocha.addFile(path.join(testDir, f)));

mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
