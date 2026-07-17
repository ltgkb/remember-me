/**
 * Remember Me - VS Code 扩展入口
 * 负责插件激活、命令注册、状态栏与侧边栏初始化
 */

import * as vscode from 'vscode';
import { getStorage, JsonStorage } from './memory/storage';
import { StatusBarManager } from './ui/statusBar';
import { SettingsPanelWebview } from './ui/webview/settingsPanel';
import { OnboardingWebview } from './ui/webview/onboarding';
import { RememberMeSidebarProvider } from './ui/sidebarProvider';
import { PromptBuilder } from './utils/promptBuilder';
import { getTemplateManager } from './template/manager';
import { getLogger } from './utils/logger';
import { EngineClient } from './utils/engineClient';
import { ConversationHistoryWebview } from './ui/webview/conversationHistory';
import { MemoryEditorWebview } from './ui/webview/memoryEditor';
import { getUpdateDetector } from './memory/updateDetector';
import { StyleChecker } from './utils/styleChecker';
import { isValidProfile } from './utils/profileGuard';
import type { Profile, ProjectContext, Conversation } from './types';
import { VersionControlWebview } from './ui/webview/versionControl';
import { getMemoryRecommender } from './memory/recommender';
import { getSearchIndex, SearchIndexResult } from './utils/searchIndex';
import { getProfileManager } from './memory/profile';
import { getProjectManager } from './memory/project';
import { AIProviderManager } from './ai/provider';
import { getConversationManager } from './memory/conversation';
import type { DetectedUpdate } from './memory/updateDetector';
import { getSearchSettings } from './utils/searchSettings';

// ── 全局状态 ──
let sidebarProvider: RememberMeSidebarProvider;
let statusBarManager: StatusBarManager;
let onboardingWebview: OnboardingWebview;
let memoryEditorWebview: MemoryEditorWebview;
let conversationHistoryWebview: ConversationHistoryWebview;
let versionControlWebview: VersionControlWebview;
let docSaveDisposable: vscode.Disposable | undefined;
// A1-修复: 语义模型轮询 interval 需提升到模块级，确保 deactivate 能清理
let semanticPollInterval: NodeJS.Timeout | undefined;
// ═══════════════════════════════════════════════════════════════
//  activate
// ═══════════════════════════════════════════════════════════════

export function activate(context: vscode.ExtensionContext): void {
  const storage = getStorage();
  const basePath = storage.getBasePath();

  // 注册侧边栏
  sidebarProvider = new RememberMeSidebarProvider(storage);
  vscode.window.registerTreeDataProvider('rememberMeSidebar', sidebarProvider);

  // 注册状态栏
  statusBarManager = new StatusBarManager(context);
  context.subscriptions.push(statusBarManager);

  // 初始化 Webview 实例
  onboardingWebview = new OnboardingWebview(context);
  memoryEditorWebview = new MemoryEditorWebview(context);
  conversationHistoryWebview = new ConversationHistoryWebview(context);
  versionControlWebview = new VersionControlWebview(context);

  // 注册所有命令（仅一次）
  registerCommands(context, storage);

  // 搜索索引初始化：优先 load，失败则 rebuild + save
  const searchIndex = getSearchIndex();
  const loaded = searchIndex.load(basePath);
  if (!loaded) {
    searchIndex.rebuild(storage);
    searchIndex.save(basePath);
  }

  // EngineClient 健康检查（不阻塞启动）
  const engineClient = new EngineClient();
  void engineClient.healthCheck().then((health) => {
    const searchSettings = getSearchSettings();
    if (!health.healthy) {
      searchSettings.setSemanticAvailable(false);
      getLogger().info('[RememberMe] Engine 服务未连接，语义搜索将禁用');
      return;
    }
    getLogger().info('[RememberMe] Engine 服务连接正常');

    // A1-修复: 使用更安全的类型判断，避免 undefined 被错误标记为可用
    if (health.semanticReady) {
      // 明确已就绪（包括 true 及任何 truthy 值）
      searchSettings.setSemanticAvailable(true);
      getLogger().info(`[RememberMe] 语义模型已就绪${health.modelLoaded ? ` (${health.modelLoaded})` : ''}`);
    } else if (health.semanticReady === false) {
      // 语义模型未预热，开始轮询
      statusBarManager.updateState({ semanticLoading: true });
      let pollCount = 0;
      const maxPolls = 6; // 60 秒 / 10 秒
      // A1-修复: interval 保存到模块级变量，确保 deactivate 可清理
      semanticPollInterval = setInterval(() => {
        pollCount++;
        void engineClient.healthCheck().then((h) => {
          if (h.semanticReady) {
            // A1-修复: 双重清理，防止重复回调产生副作用
            if (semanticPollInterval) {
              clearInterval(semanticPollInterval);
              semanticPollInterval = undefined;
            }
            statusBarManager.updateState({ semanticLoading: false });
            searchSettings.setSemanticAvailable(true);
            getLogger().info(`[RememberMe] 语义模型已就绪${h.modelLoaded ? ` (${h.modelLoaded})` : ''}`);
            return;
          }
          // A1-修复: 将超时检查也放在异步回调中，避免 pollCount 与 interval 状态不同步
          if (pollCount >= maxPolls) {
            if (semanticPollInterval) {
              clearInterval(semanticPollInterval);
              semanticPollInterval = undefined;
            }
            statusBarManager.updateState({ semanticLoading: false });
            getLogger().warn('[RememberMe] 语义模型预热超时（60 秒），语义搜索可能不可用');
          }
        }).catch((err: unknown) => {
          // A1-修复: healthCheck 失败不应中断轮询，但需记录日志
          getLogger().warn('[RememberMe] 语义模型轮询 healthCheck 失败', err);
          if (pollCount >= maxPolls) {
            if (semanticPollInterval) {
              clearInterval(semanticPollInterval);
              semanticPollInterval = undefined;
            }
            statusBarManager.updateState({ semanticLoading: false });
            getLogger().warn('[RememberMe] 语义模型预热超时（60 秒），语义搜索可能不可用');
          }
        });
      }, 10000);
      return;
    } else {
      // semanticReady 为 undefined 或其他意外值 — 安全降级为不可用
      searchSettings.setSemanticAvailable(false);
      getLogger().warn('[RememberMe] 语义模型状态未知，语义搜索将禁用');
    }
  });

  // 首次运行检查
  void checkFirstRun();
}

// ═══════════════════════════════════════════════════════════════
//  registerCommands
// ═══════════════════════════════════════════════════════════════

function registerCommands(context: vscode.ExtensionContext, storage: JsonStorage): void {
  // 1. 打开设置
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.openSettings',
      runWithErrorHandler(() => {
        SettingsPanelWebview.createOrShow(
          context.extensionUri,
          storage,
          'welcome',
          () => sidebarProvider.refresh()
        );
      })
    )
  );

  // 2. 开始对话（含智能推荐记忆、文档保存监听）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.startChat',
      runWithErrorHandler(async () => {
        const profileManager = getProfileManager();
        const projectManager = getProjectManager();
        const profile = profileManager.read();
        const project = projectManager.getCurrent();

        if (!isValidProfile(profile)) {
          void vscode.window.showWarningMessage('请先完成个人画像设置');
          return;
        }

        const userInput = await vscode.window.showInputBox({
          prompt: '输入消息开始对话',
          placeHolder: '例如：帮我写一份 PRD...'
        });
        if (!userInput) {
          return;
        }

        // 智能推荐记忆
        const recommender = getMemoryRecommender();
        const recommendations = recommender.recommend(userInput, project?.name);
        if (recommendations.length > 0) {
          const top = recommendations[0];
          const selection = await vscode.window.showInformationMessage(
            `💡 相关记忆：${top.title}`,
            '查看',
            '忽略'
          );
          if (selection === '查看') {
            void vscode.commands.executeCommand('rememberMe.openMemoryEditor', top.id);
          }
        }

        // 构建记忆 Prompt
        const promptBuilder = new PromptBuilder();
        const systemPrompt = promptBuilder.build(profile, project || undefined);

        // 初始化 AI 并对话
        const aiManager = AIProviderManager.getInstance();
        await aiManager.initialize();

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userInput }
        ];

        await withProgress('AI 思考中...', async () => {
          let response = '';
          for await (const chunk of aiManager.chat(messages)) {
            response += chunk;
          }
          const doc = await vscode.workspace.openTextDocument({
            content: response,
            language: 'markdown'
          });
          void vscode.window.showTextDocument(doc);
        });

        // 文档保存监听（风格检查）
        if (docSaveDisposable) {
          docSaveDisposable.dispose();
        }
        docSaveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
          if (doc.languageId === 'markdown') {
            const content = doc.getText();
            const checker = new StyleChecker(profile);
            const results = checker.check(content);
            const failed = results.filter((r) => !r.passed);
            if (failed.length > 0) {
              statusBarManager.showStyleConsistencyWarning(failed[0].message);
            }
          }
        });
        context.subscriptions.push(docSaveDisposable);
      })
    )
  );

  // 3. 切换项目
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.switchProject',
      runWithErrorHandler(async (preselected?: string) => {
        const projectManager = getProjectManager();
        if (preselected) {
          projectManager.setCurrent(preselected);
        } else {
          const projects = projectManager.list();
          const selected = await vscode.window.showQuickPick(
            projects.map((p) => p.name),
            { placeHolder: '选择项目' }
          );
          if (!selected) {
            return;
          }
          projectManager.setCurrent(selected);
        }
        const currentProject = projectManager.getCurrent();
        statusBarManager.setCurrentProject(currentProject);
        sidebarProvider.refresh();
        void vscode.window.showInformationMessage(
          `已切换到项目: ${currentProject?.name || '未知'}`
        );
      })
    )
  );

  // 4. 搜索记忆（支持关键词 / 语义 / 混合三种模式）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.searchMemory',
      runWithErrorHandler(async (query?: string) => {
        const searchSettings = getSearchSettings();
        const settings = searchSettings.read();
        const isSemantic = settings.mode === 'semantic';
        const isHybrid = settings.mode === 'hybrid';

        // 若外部未传入 query，则弹出输入框
        const input = query
          ? query
          : await vscode.window.showInputBox({
              prompt: isHybrid ? '混合搜索记忆' : isSemantic ? '语义搜索记忆' : '关键词搜索记忆',
              placeHolder: isHybrid
                ? '🔍🧠 输入关键词或自然语言描述…'
                : isSemantic
                  ? '🧠 用自然语言描述你想找的记忆…'
                  : '输入关键词，例如：OAuth、登录方案',
            });
        if (!input) {
          return;
        }

        if (isHybrid) {
          await runHybridSearch(input);
        } else if (isSemantic) {
          await runSemanticSearch(input);
        } else {
          await runKeywordSearch(input);
        }
      })
    )
  );

  // 4b. 切换搜索模式（关键词 ↔ 语义 ↔ 混合）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.toggleSearchMode',
      runWithErrorHandler(async () => {
        const searchSettings = getSearchSettings();
        const current = searchSettings.read();
        // 推断下一个模式
        const nextMode = current.mode === 'keyword' ? 'semantic' : current.mode === 'semantic' ? 'hybrid' : 'keyword';
        // 切到语义或混合前先确认服务可用
        if (nextMode === 'semantic' || nextMode === 'hybrid') {
          const engineClient = new EngineClient();
          const health = await engineClient.healthCheck();
          if (!health.healthy) {
            const choice = await vscode.window.showWarningMessage(
              '语义/混合搜索需要 memory-engine 服务运行中，当前未检测到服务。是否仍切换？',
              '仍切换',
              '取消'
            );
            if (choice !== '仍切换') {
              return;
            }
          }
        }
        const next = searchSettings.toggle();
        const label = next === 'semantic' ? '🧠 语义搜索' : next === 'hybrid' ? '🔍🧠 混合搜索' : '🔍 关键词搜索';
        void vscode.window.showInformationMessage(`已切换到${label}模式`);
        statusBarManager.updateSearchMode(next);
      })
    )
  );

  // 4c. 构建语义索引
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.buildSemanticIndex',
      runWithErrorHandler(async () => {
        const engineClient = new EngineClient();
        const health = await engineClient.healthCheck();
        if (!health.healthy) {
          void vscode.window.showErrorMessage(
            'memory-engine 服务未运行，无法构建索引。请先启动服务。'
          );
          return;
        }
        const total = await withProgress('正在构建语义索引…', () =>
          engineClient.buildSemanticIndex()
        );
        if (total >= 0) {
          getSearchSettings().setSemanticAvailable(true);
          void vscode.window.showInformationMessage(
            `语义索引构建完成，共索引 ${total} 条记忆`
          );
        } else {
          void vscode.window.showErrorMessage(
            '语义索引构建失败，请确认 chromadb 与 sentence-transformers 已安装'
          );
        }
      })
    )
  );

  // 5. 更新个人画像
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.updateProfile',
      runWithErrorHandler(() => {
        SettingsPanelWebview.createOrShow(
          context.extensionUri,
          storage,
          'profile',
          () => sidebarProvider.refresh()
        );
      })
    )
  );

  // 6. 显示菜单
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.showMenu',
      runWithErrorHandler(async () => {
        const items: vscode.QuickPickItem[] = [
          { label: '$(comment-discussion) 开始对话', description: 'startChat' },
          { label: '$(search) 搜索记忆', description: 'searchMemory' },
          { label: '$(gear) 打开设置', description: 'openSettings' },
          { label: '$(history) 查看对话历史', description: 'viewConversationHistory' }
        ];
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: '选择操作'
        });
        if (selected) {
          void vscode.commands.executeCommand(`rememberMe.${selected.description}`);
        }
      })
    )
  );

  // 7. 显示快捷菜单
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.showQuickMenu',
      runWithErrorHandler(async () => {
        await statusBarManager.showQuickMenu();
      })
    )
  );

  // 8. 打开设置向导
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.openOnboarding',
      runWithErrorHandler(() => {
        onboardingWebview.show();
      })
    )
  );

  // 9. 打开记忆编辑器
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.openMemoryEditor',
      runWithErrorHandler(() => {
        memoryEditorWebview.show();
      })
    )
  );

  // 10. 刷新记忆
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.refreshMemory',
      runWithErrorHandler(() => {
        sidebarProvider.refresh();
        const profileManager = getProfileManager();
        const projectManager = getProjectManager();
        const profile = profileManager.read();
        const project = projectManager.getCurrent();
        statusBarManager.setProfile(profile);
        statusBarManager.setCurrentProject(project);
        void vscode.window.showInformationMessage('记忆已刷新');
      })
    )
  );

  // 11. 查看对话历史
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.viewConversationHistory',
      runWithErrorHandler(() => {
        conversationHistoryWebview.show();
      })
    )
  );

  // 12. 关于
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.showAbout',
      runWithErrorHandler(() => {
        void vscode.window.showInformationMessage('Remember Me v0.3.0 - AI 记忆管家（Phase 3 智能增强 + 语义搜索）');
      })
    )
  );

  // 13. 更新项目上下文
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.updateProjectContext',
      runWithErrorHandler(async (info?: string) => {
        const projectManager = getProjectManager();
        const currentProject = projectManager.getCurrent();
        if (!currentProject) {
          void vscode.window.showWarningMessage('请先选择项目');
          return;
        }
        const result = projectManager.addDecision(
          currentProject.name,
          '上下文更新',
          info || '',
          '已确定'
        );
        if (result) {
          void vscode.window.showInformationMessage('项目上下文已更新');
          sidebarProvider.refresh();
        }
      })
    )
  );

  // 14. 标记为待确认
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.markAsPending',
      runWithErrorHandler(async (info?: string) => {
        const projectManager = getProjectManager();
        const currentProject = projectManager.getCurrent();
        if (!currentProject) {
          void vscode.window.showWarningMessage('请先选择项目');
          return;
        }
        const updateDetector = getUpdateDetector();
        const update: DetectedUpdate = {
          type: 'decision',
          rawText: info || '',
          confidence: 0.8
        };
        await updateDetector.markAsPending(currentProject.name, update);
        void vscode.window.showInformationMessage('已标记为待确认');
      })
    )
  );

  // 15. 自动修复风格
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.autoFixStyle',
      runWithErrorHandler(async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showWarningMessage('请先打开一个文档');
          return;
        }
        const content = editor.document.getText();
        const profileManager = getProfileManager();
        const profile = profileManager.read();
        const checker = new StyleChecker(profile || undefined);
        const results = checker.check(content);
        const fixed = checker.autoFix(content, results);
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(content.length)
        );
        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, fixed);
        });
        void vscode.window.showInformationMessage('风格已自动修复');
      })
    )
  );

  // 16. 选择模板
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.selectTemplate',
      runWithErrorHandler(async () => {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        const items = templates.map((t) => ({
          label: `${t.isBuiltIn ? '📦' : '✏️'} ${t.name}`,
          description: t.description,
          id: t.id
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: '选择文档模板'
        });
        if (!selected) {
          return;
        }
        const application = templateManager.apply(selected.id);
        if (application) {
          const doc = await vscode.workspace.openTextDocument({
            content: application.generatedPrompt,
            language: 'markdown'
          });
          void vscode.window.showTextDocument(doc);
        }
      })
    )
  );

  // 17. 预览模板结构
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.previewTemplate',
      runWithErrorHandler(async () => {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        const items = templates.map((t) => ({
          label: t.name,
          description: t.description,
          id: t.id
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: '预览模板结构'
        });
        if (!selected) {
          return;
        }
        const structure = templateManager.getStructure(selected.id);
        if (structure) {
          const lines: string[] = [];
          lines.push(`【模板结构】\n`);
          lines.push(`前言：${structure.preamble}\n`);
          lines.push('章节：');
          for (const section of structure.sections) {
            lines.push(`- ${section.title}${section.required ? '（必填）' : '（可选）'}`);
          }
          const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n'),
            language: 'markdown'
          });
          void vscode.window.showTextDocument(doc);
        }
      })
    )
  );

  // 18. 管理模板
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.manageTemplates',
      runWithErrorHandler(() => {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        const builtInCount = templates.filter((t) => t.isBuiltIn).length;
        void vscode.window.showInformationMessage(
          `当前共有 ${templates.length} 个模板（${builtInCount} 个内置，${templates.length - builtInCount} 个自定义）`
        );
      })
    )
  );

  // 19. 画像更新事件（内部）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.profileUpdated',
      runWithErrorHandler((profile?: Profile) => {
        const profileManager = getProfileManager();
        const currentProfile = profile || profileManager.read();
        const projectManager = getProjectManager();
        const project = projectManager.getCurrent();
        statusBarManager.setProfile(currentProfile);
        statusBarManager.setCurrentProject(project);
        if (isValidProfile(currentProfile)) {
          statusBarManager.showMemoryActivation(currentProfile, project);
        }
        sidebarProvider.refresh();
      })
    )
  );

  // 20. 记忆版本控制
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.openVersionControl',
      runWithErrorHandler(() => {
        versionControlWebview.show();
      })
    )
  );

  // 21. 忽略推荐
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.ignoreRecommendation',
      runWithErrorHandler((recommendationId?: string) => {
        if (!recommendationId) {
          return;
        }
        const recommender = getMemoryRecommender();
        recommender.ignoreInSession(recommendationId);
      })
    )
  );

  // 22. 导出模板
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.exportTemplate',
      runWithErrorHandler(async () => {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        const selected = await vscode.window.showQuickPick(
          templates.map((t) => ({ label: t.name, id: t.id })),
          { placeHolder: '选择要导出的模板' }
        );
        if (!selected) {
          return;
        }
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`${selected.id}.json`),
          filters: { JSON: ['json'] }
        });
        if (!uri) {
          return;
        }
        const success = templateManager.exportToFile(selected.id, uri.fsPath);
        if (success) {
          void vscode.window.showInformationMessage('模板导出成功');
        } else {
          void vscode.window.showErrorMessage('模板导出失败');
        }
      })
    )
  );

  // 23. 导入模板
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.importTemplate',
      runWithErrorHandler(async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { JSON: ['json'] }
        });
        if (!uris || uris.length === 0) {
          return;
        }
        const templateManager = getTemplateManager();
        const result = templateManager.importFromFile(uris[0].fsPath);
        if (result.success) {
          void vscode.window.showInformationMessage(
            `模板导入成功：${result.template?.id || ''}`
          );
          sidebarProvider.refresh();
        } else {
          void vscode.window.showErrorMessage(
            `模板导入失败：${result.errors.join(', ')}`
          );
        }
      })
    )
  );

  // package.json 中声明但任务列表未显式包含的 applyTemplate（为避免 VS Code 警告）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rememberMe.applyTemplate',
      runWithErrorHandler(async () => {
        const templateManager = getTemplateManager();
        const templates = templateManager.listAll();
        const selected = await vscode.window.showQuickPick(
          templates.map((t) => ({ label: t.name, id: t.id })),
          { placeHolder: '选择要应用的模板' }
        );
        if (!selected) {
          return;
        }
        const application = templateManager.apply(selected.id);
        if (application) {
          const doc = await vscode.workspace.openTextDocument({
            content: application.generatedPrompt,
            language: 'markdown'
          });
          void vscode.window.showTextDocument(doc);
        }
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════════
//  辅助函数
// ═══════════════════════════════════════════════════════════════

/**
 * 统一错误处理包装器：捕获同步/异步异常并弹窗提示
 */
function runWithErrorHandler<T extends unknown[]>(
  fn: (...args: T) => void | Promise<void>
): (...args: T) => void {
  return (...args: T) => {
    Promise.resolve()
      .then(() => fn(...args))
      .catch((err: unknown) => {
        getLogger().error('[RememberMe] 命令执行失败', err);
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`操作失败: ${message}`);
      });
  };
}

/**
 * 带进度通知的执行包装器
 */
function withProgress<T>(title: string, task: () => Thenable<T>): Thenable<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false
    },
    () => task()
  );
}

/**
 * 首次运行检测：若画像未初始化则提示打开向导
 */
async function checkFirstRun(): Promise<void> {
  const profileManager = getProfileManager();
  if (!profileManager.isInitialized()) {
    const choice = await vscode.window.showInformationMessage(
      '欢迎使用 Remember Me！是否开始设置向导？',
      '开始设置',
      '稍后'
    );
    if (choice === '开始设置') {
      void vscode.commands.executeCommand('rememberMe.openOnboarding');
    }
  }
}

/**
 * 构建当前记忆注入 Prompt
 */
function buildMemoryPrompt(): string {
  const profileManager = getProfileManager();
  const projectManager = getProjectManager();
  const profile = profileManager.read();
  const project = projectManager.getCurrent();

  if (!isValidProfile(profile)) {
    return '';
  }

  const builder = new PromptBuilder();
  return builder.build(profile, project || undefined);
}

/**
 * 在存储中搜索关键词：优先使用 SearchIndex，回退全量遍历
 */
async function searchInStorage(keyword: string): Promise<SearchIndexResult[]> {
  const searchIndex = getSearchIndex();
  if (searchIndex.isReady()) {
    return searchIndex.search(keyword);
  }

  // 回退：全量遍历
  const storage = getStorage();
  const results: SearchIndexResult[] = [];
  const kw = keyword.toLowerCase();
  const projects = storage.listDir('projects');

  for (const projectName of projects) {
    const context = storage.read<ProjectContext>('projects', projectName, 'context.json');
    if (
      context &&
      (context.name.toLowerCase().includes(kw) ||
        context.targetUsers.toLowerCase().includes(kw) ||
        context.coreFeatures.toLowerCase().includes(kw))
    ) {
      results.push({ path: `projects/${projectName}/context.json`, score: 1 });
    }

    const convFiles = storage.listDir('projects', projectName, 'conversations');
    for (const convFile of convFiles) {
      if (!convFile.endsWith('.json')) {
        continue;
      }
      const conv = storage.read<Conversation>('projects', projectName, 'conversations', convFile);
      if (conv && conv.title.toLowerCase().includes(kw)) {
        results.push({
          path: `projects/${projectName}/conversations/${convFile}`,
          score: 1
        });
      }
    }
  }

  return results;
}

/**
 * 关键词搜索：复用本地 SearchIndex，结果以 QuickPick 展示
 */
async function runKeywordSearch(keyword: string): Promise<void> {
  const results = await searchInStorage(keyword);
  if (results.length === 0) {
    const trySemantic = await vscode.window.showInformationMessage(
      `🔍 关键词「${keyword}」未找到匹配记忆`,
      '试试语义搜索',
      '取消'
    );
    if (trySemantic === '试试语义搜索') {
      getSearchSettings().setMode('semantic');
      statusBarManager.updateSearchMode('semantic');
      await runSemanticSearch(keyword);
    }
    return;
  }
  await showSearchResults(
    results.map((r) => ({
      label: r.path.split('/').pop() || r.path,
      description: r.path,
      detail: `关键词匹配 · 评分 ${r.score}`,
      path: r.path,
    })),
    keyword
  );
}

/**
 * 语义搜索：调用 memory-engine 的 /semantic-search 端点
 */
async function runSemanticSearch(query: string): Promise<void> {
  const engineClient = new EngineClient();
  const projectManager = getProjectManager();
  const currentProject = projectManager.getCurrent();
  const projectName = currentProject?.name;

  let results: Awaited<ReturnType<EngineClient['semanticSearch']>>;
  await withProgress('🧠 语义检索中…', async () => {
    results = await engineClient.semanticSearch(query, projectName, 8, 0);
  });
  results = results!;

  if (results.length === 0) {
    const tryKeyword = await vscode.window.showInformationMessage(
      `🧠 语义搜索未找到匹配记忆（可能索引未构建或服务降级）`,
      '回退关键词搜索',
      '构建索引',
      '取消'
    );
    if (tryKeyword === '回退关键词搜索') {
      getSearchSettings().setMode('keyword');
      statusBarManager.updateSearchMode('keyword');
      await runKeywordSearch(query);
    } else if (tryKeyword === '构建索引') {
      void vscode.commands.executeCommand('rememberMe.buildSemanticIndex');
    }
    return;
  }

  await showSearchResults(
    results.map((r) => ({
      label: `🧠 ${(r.score * 100).toFixed(0)}% · ${r.text.slice(0, 40).replace(/\n/g, ' ')}`,
      description: r.metadata && (r.metadata as { source?: string }).source
        ? String((r.metadata as { source?: string }).source)
        : r.id,
      detail: r.text.slice(0, 120).replace(/\n/g, ' '),
      path: r.id,
      fullText: r.text,
    })),
    query
  );
}

/**
 * 混合搜索：调用 memory-engine 的 /hybrid-search 端点
 */
async function runHybridSearch(query: string): Promise<void> {
  const engineClient = new EngineClient();
  const projectManager = getProjectManager();
  const currentProject = projectManager.getCurrent();
  const projectName = currentProject?.name;

  let results: Awaited<ReturnType<EngineClient['hybridSearch']>>;
  await withProgress('🔍🧠 混合检索中…', async () => {
    results = await engineClient.hybridSearch(query, projectName, 8, 0.5, 0.5);
  });
  results = results!;

  if (results.length === 0) {
    const tryKeyword = await vscode.window.showInformationMessage(
      `🔍🧠 混合搜索未找到匹配记忆（可能索引未构建或服务降级）`,
      '回退关键词搜索',
      '构建索引',
      '取消'
    );
    if (tryKeyword === '回退关键词搜索') {
      getSearchSettings().setMode('keyword');
      statusBarManager.updateSearchMode('keyword');
      await runKeywordSearch(query);
    } else if (tryKeyword === '构建索引') {
      void vscode.commands.executeCommand('rememberMe.buildSemanticIndex');
    }
    return;
  }

  await showSearchResults(
    results.map((r) => ({
      label: `🔍🧠 ${(r.score * 100).toFixed(0)}% · ${r.text.slice(0, 40).replace(/\n/g, ' ')}`,
      description: r.metadata && (r.metadata as { source?: string }).source
        ? String((r.metadata as { source?: string }).source)
        : r.id,
      detail: r.text.slice(0, 120).replace(/\n/g, ' '),
      path: r.id,
      fullText: r.text,
    })),
    query
  );
}

/**
 * 将搜索结果渲染为 QuickPick 供用户选择
 */
async function showSearchResults(
  items: Array<{
    label: string;
    description: string;
    detail: string;
    path: string;
    fullText?: string;
  }>,
  query: string
): Promise<void> {
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `「${query}」找到 ${items.length} 条结果，选择查看详情`,
  });
  if (!selected) {
    return;
  }
  // 在新文档中展示完整内容
  const content = selected.fullText || selected.description;
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown',
  });
  void vscode.window.showTextDocument(doc);
}

// ═══════════════════════════════════════════════════════════════
//  deactivate
// ═══════════════════════════════════════════════════════════════

export function deactivate(): void {
  // A1-修复: 清理语义模型轮询 interval，防止内存泄漏
  if (semanticPollInterval) {
    clearInterval(semanticPollInterval);
    semanticPollInterval = undefined;
  }
  if (docSaveDisposable) {
    docSaveDisposable.dispose();
  }
  getLogger().info('[RememberMe] 扩展已停用');
}
