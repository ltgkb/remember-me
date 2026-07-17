const fs = require('fs');
const path = 'extension.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Part A: lines 0-78 (imports through end of activate)
const partA = lines.slice(0, 79);

// Part C: lines 79-464 (tail of registerCommands, from onboarding.show through its closing brace)
const partC = lines.slice(79, 465);

// Part E: lines 465-end (checkFirstRun, buildMemoryPrompt, searchInStorage, deactivate)
const partE = lines.slice(465);

// Missing prefix of registerCommands
const partB = `
/**
 * 统一包装命令执行：错误捕获 + 日志
 */
async function runWithErrorHandling(
  title: string,
  fn: () => Promise<void> | void
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    getLogger().error(\`[RememberMe] 命令执行失败: \${title}\`, error);
    void vscode.window.showErrorMessage(\`Remember Me 出错：\${message}\`);
  }
}

/**
 * 显示可取消的进度通知
 */
function withProgress<T>(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ) => Thenable<T>
): Thenable<T> {
  return vscode.window.withProgress<T>(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    task
  );
}

/**
 * 注册所有 VS Code 命令
 */
function registerCommands(
  context: vscode.ExtensionContext,
  storage: ReturnType<typeof getStorage>
): void {

  // ── 打开设置面板 ──
  const openSettingsCmd = vscode.commands.registerCommand(
    'rememberMe.openSettings',
    () => runWithErrorHandling('打开设置', async () => {
      SettingsPanelWebview.createOrShow(
        context.extensionUri,
        storage,
        'welcome',
        () => sidebarProvider.refresh()
      );
    })
  );
  context.subscriptions.push(openSettingsCmd);

  // ── 开始对话（注入记忆 Prompt） ──
  const startChatCmd = vscode.commands.registerCommand(
    'rememberMe.startChat',
    () => runWithErrorHandling('开始对话', async () => {
      const prompt = buildMemoryPrompt(context, storage);
      if (prompt) {
        const doc = await vscode.workspace.openTextDocument({
          content: prompt,
          language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
        void vscode.window.showInformationMessage('🧠 Remember Me 记忆已注入');

        // ── Phase 3: 智能推荐记忆（内容感知）──
        const currentProjectName = context.workspaceState.get<string>('rememberMe.currentProject');
        const recommender = getMemoryRecommender();
        const recommendations = recommender.recommend(prompt, currentProjectName || undefined);
        if (recommendations.length > 0) {
          const topRec = recommendations[0];
          if (topRec.relevanceScore >= 0.3) {
            statusBar.showMemoryRecommendation(topRec);
          }
        }

        // 监听文档保存，检测新信息并提示用户更新（A2 需求）

        // 监听文档保存，检测新信息并提示用户更新（A2 需求）
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
          if (savedDoc === doc) {
            const content = savedDoc.getText();
            const updateDetector = getUpdateDetector();
            const detected = updateDetector.detect({ role: 'user', content, timestamp: new Date().toISOString() });
            const top = detected.length > 0
              ? detected.reduce((a, b) => a.confidence > b.confidence ? a : b)
              : null;
            if (top && top.confidence >= 0.6) {
              statusBar.showNewInfoDetected(top.suggestedTitle || top.rawText);
            }
          }
        });
        context.subscriptions.push(saveDisposable);
      } else {
        const result = await vscode.window.showWarningMessage(
          '尚未完成设置，无法注入记忆',
          '去设置',
          '取消'
        );
        if (result === '去设置') {
          SettingsPanelWebview.createOrShow(
            context.extensionUri,
            storage,
            'welcome',
            () => sidebarProvider.refresh()
          );
        }
      }
    })
  );
  context.subscriptions.push(startChatCmd);

  // ── 切换项目 ──
  const switchProjectCmd = vscode.commands.registerCommand(
    'rememberMe.switchProject',
    () => runWithErrorHandling('切换项目', async () => {
      const projects = storage.listDir('projects');
      if (projects.length === 0) {
        const result = await vscode.window.showWarningMessage(
          '暂无项目，请先创建',
          '创建项目',
          '取消'
        );
        if (result === '创建项目') {
          SettingsPanelWebview.createOrShow(
            context.extensionUri,
            storage,
            'project',
            () => sidebarProvider.refresh()
          );
        }
        return;
      }

      const selected = await vscode.window.showQuickPick(projects, {
        placeHolder: '选择要切换的项目'
      });

      if (selected) {
        await context.workspaceState.update('rememberMe.currentProject', selected);

        const projectContext = storage.read<ProjectContext>('projects', selected, 'context.json');
        statusBar.setCurrentProject(projectContext);

        sidebarProvider.refresh();
        void vscode.window.showInformationMessage(\`已切换到项目: \${selected}\`);
      }
    })
  );
  context.subscriptions.push(switchProjectCmd);

  // ── 搜索记忆 ──
  const searchMemoryCmd = vscode.commands.registerCommand(
    'rememberMe.searchMemory',
    () => runWithErrorHandling('搜索记忆', async () => {
      const keyword = await vscode.window.showInputBox({
        prompt: '输入关键词搜索记忆',
        placeHolder: '例如：用户权限、OAuth、验收标准'
      });
      if (!keyword) { return; }

      const results = await withProgress('正在搜索记忆...', async () => searchInStorage(storage, keyword));
      if (results.length > 0) {
        const items = results.map(r => ({
          label: r.path,
          detail: r.content
        }));
        await vscode.window.showQuickPick(items, {
          placeHolder: \`找到 \${results.length} 条相关记忆\`
        });
      } else {
        void vscode.window.showInformationMessage('未找到相关记忆');
      }
    })
  );
  context.subscriptions.push(searchMemoryCmd);

  // ── 更新个人画像 ──
  const updateProfileCmd = vscode.commands.registerCommand(
    'rememberMe.updateProfile',
    () => runWithErrorHandling('更新个人画像', async () => {
      SettingsPanelWebview.createOrShow(
        context.extensionUri,
        storage,
        'profile',
        () => sidebarProvider.refresh()
      );
    })
  );
  context.subscriptions.push(updateProfileCmd);

  // ── 状态栏菜单 ──
  const showMenuCmd = vscode.commands.registerCommand(
    'rememberMe.showMenu',
    () => runWithErrorHandling('显示菜单', async () => {
      interface MenuItem extends vscode.QuickPickItem {
        command: string;
      }
      const items: MenuItem[] = [
        {
          label: '$(gear) 打开设置',
          description: '配置个人画像、项目、AI 提供商',
          command: 'rememberMe.openSettings'
        },
        {
          label: '$(comment-discussion) 开始对话',
          description: '在新文档中注入记忆 Prompt',
          command: 'rememberMe.startChat'
        },
        {
          label: '$(file-code) 选择文档模板',
          description: 'PRD / 商业计划书 / 论文等场景模板',
          command: 'rememberMe.selectTemplate'
        },
        {
          label: '$(folder) 切换项目',
          description: '切换到其他项目上下文',
          command: 'rememberMe.switchProject'
        },
        {
          label: '$(search) 搜索记忆',
          description: '关键词搜索历史记忆',
          command: 'rememberMe.searchMemory'
        }
      ];
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '🧠 Remember Me 菜单'
      });
      if (selected) {
        await vscode.commands.executeCommand(selected.command);
      }
    })
  );
  context.subscriptions.push(showMenuCmd);

  // ── 打开首次设置向导 ──
  const openOnboardingCmd = vscode.commands.registerCommand(
    'rememberMe.openOnboarding',
    () => runWithErrorHandling('打开设置向导', async () => {
      const onboarding = new OnboardingWebview(context);`.trim();

const result = [
  ...partA,
  partB,
  ...partC,
  ...partE
].join('\n');

fs.writeFileSync(path, result);
console.log('Reconstructed extension.ts');
