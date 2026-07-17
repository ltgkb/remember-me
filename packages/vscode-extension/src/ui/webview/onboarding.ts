/**
 * Remember Me - 首次使用向导
 * 3 分钟问卷式设置，引导新用户完成初始配置
 */

import * as vscode from 'vscode';
import { BaseWebview } from './baseWebview';
import type { Profile, IdentityInfo, StyleInfo } from '../../types';
import { getStorage } from '../../memory/storage';

export class OnboardingWebview extends BaseWebview {
  private currentStep: number = 0;
  private collectedData: Record<string, unknown> = {};

  constructor(context: vscode.ExtensionContext) {
    super(context);
  }

  show(): void {
    const panel = this.createOrShowPanel({
      viewType: 'rememberMe.onboarding',
      title: '🧠 欢迎使用 Remember Me',
      column: vscode.ViewColumn.One,
    });
    panel.webview.html = this.getHtml(panel.webview);
  }

  protected getHtml(webview: vscode.Webview): string {
    const steps = [
      { title: '身份角色', desc: '你是做什么的？' },
      { title: '文档偏好', desc: '你写什么类型的文档？' },
      { title: '风格设置', desc: '你的文档风格是？' },
      { title: '特殊习惯', desc: '你有什么特殊要求？' },
      { title: '创建项目', desc: '你目前在做什么项目？' },
    ];

    const stepDots = steps.map((step, i) => {
      const cls = i < this.currentStep ? 'completed' : i === this.currentStep ? 'active' : '';
      return `<div class="step-dot ${cls}">${i < this.currentStep ? '✓' : i + 1}</div>${i < steps.length - 1 ? `<div class="step-line ${i < this.currentStep ? 'completed' : ''}"></div>` : ''}`;
    }).join('');

    const contentHtml = `
      <div class="step-indicator">
        ${stepDots}
      </div>
      <div id="step-content" class="animate-in">
        ${this.renderStepContent()}
      </div>
      <script>
        function collectStepData() {
          const data = {};
          const selects = document.querySelectorAll('select');
          selects.forEach(s => { data[s.id] = s.value; });
          const inputs = document.querySelectorAll('input[type="text"]');
          inputs.forEach(inp => { data[inp.id] = inp.value; });
          const checked = document.querySelectorAll('input[type="checkbox"]:checked');
          if (checked.length > 0) {
            data.habits = Array.from(checked).map(cb => cb.value);
          }
          return data;
        }
        function nextStep() {
          postMessage('nextStep', collectStepData());
        }
        function prevStep() {
          postMessage('prevStep');
        }
        function finish() {
          postMessage('finish', collectStepData());
        }
        function toggleCheckbox(el) {
          el.classList.toggle('checked');
          const cb = el.querySelector('input[type="checkbox"]');
          if (cb) { cb.checked = !cb.checked; }
        }
      </script>
    `;

    return this.getBaseHtml(webview, contentHtml);
  }

  private renderStepContent(): string {
    switch (this.currentStep) {
      case 0:
        return this.renderIdentityStep();
      case 1:
        return this.renderDocumentTypeStep();
      case 2:
        return this.renderStyleStep();
      case 3:
        return this.renderHabitsStep();
      case 4:
        return this.renderProjectStep();
      default:
        return this.renderCompleteStep();
    }
  }

  private renderIdentityStep(): string {
    const roles: IdentityInfo['role'][] = ['产品经理', '运营', '设计师', '学生', '创业者', '管理者', '其他'];
    const experiences: IdentityInfo['experience'][] = ['新手', '1-3年', '3-5年', '5年以上'];
    const industries: IdentityInfo['industry'][] = ['电商', 'SaaS', '社交', '金融', '教育', '医疗', '其他'];
    const backgrounds: IdentityInfo['background'][] = ['技术', '商业', '设计', '文科', '其他'];

    return `
      <h2>👤 第一步：你是谁？</h2>
      <p>告诉 AI 你的背景，让它更了解你。</p>
      <div class="card">
        <div class="form-group">
          <label>你的角色</label>
          <select id="role">
            ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>经验水平</label>
          <select id="experience">
            ${experiences.map(e => `<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>行业领域</label>
          <select id="industry">
            ${industries.map(i => `<option value="${i}">${i}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>专业背景</label>
          <select id="background">
            ${backgrounds.map(b => `<option value="${b}">${b}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="nextStep()">下一步 →</button>
      </div>
    `;
  }

  private renderDocumentTypeStep(): string {
    const types = [
      { id: 'prd', label: 'PRD（产品需求文档）', icon: '📋' },
      { id: 'business-plan', label: '商业计划书', icon: '📊' },
      { id: 'thesis', label: '学术论文', icon: '📑' },
      { id: 'market-report', label: '市场调研报告', icon: '📈' },
      { id: 'activity-plan', label: '活动策划方案', icon: '🎉' },
      { id: 'design-doc', label: '设计说明文档', icon: '🎨' },
      { id: 'tech-doc', label: '技术方案文档', icon: '⚙️' },
      { id: 'report', label: '汇报材料', icon: '📢' },
    ];

    return `
      <h2>📝 第二步：你写什么文档？</h2>
      <p>选择你主要创作的文档类型，AI 会据此优化回复。</p>
      <div class="card">
        <div class="checkbox-group" id="doc-types">
          ${types.map(t => `
            <label class="checkbox-item">
              <input type="checkbox" value="${t.id}" onchange="this.parentElement.classList.toggle('checked', this.checked)">
              <span>${t.icon} ${t.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep()">← 上一步</button>
        <button class="btn btn-primary" onclick="nextStep()">下一步 →</button>
      </div>
    `;
  }

  private renderStyleStep(): string {
    const structures: StyleInfo['documentStructure'][] = ['先背景后功能', '先功能后背景', '自由结构'];
    const detailLevels: StyleInfo['detailLevel'][] = ['简洁（1页）', '标准（3-5页）', '详尽（10页以上）'];
    const languages: StyleInfo['language'][] = ['中文', '英文', '双语'];
    const tones: StyleInfo['tone'][] = ['正式', '口语化', '学术'];
    const responseStyles: StyleInfo['responseStyle'][] = ['先框架再细节', '直接完整内容', '逐步引导'];

    return `
      <h2>✨ 第三步：你的文档风格</h2>
      <p>告诉 AI 你喜欢的写作方式。</p>
      <div class="card">
        <div class="form-group">
          <label>文档结构偏好</label>
          <select id="documentStructure">
            ${structures.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>详细程度</label>
          <select id="detailLevel">
            ${detailLevels.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>语言</label>
          <select id="language">
            ${languages.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>语气风格</label>
          <select id="tone">
            ${tones.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>回复风格</label>
          <select id="responseStyle">
            ${responseStyles.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep()">← 上一步</button>
        <button class="btn btn-primary" onclick="nextStep()">下一步 →</button>
      </div>
    `;
  }

  private renderHabitsStep(): string {
    const habits = [
      { id: 'moscow', label: 'MoSCoW 优先级' },
      { id: 'user-journey', label: '用户旅程图' },
      { id: 'competitor', label: '竞品对比' },
      { id: 'acceptance-criteria', label: '验收标准' },
      { id: 'user-story', label: '用户故事' },
      { id: 'financial-forecast', label: '财务预测' },
      { id: 'swot', label: 'SWOT 分析' },
      { id: 'data-chart', label: '数据图表' },
      { id: 'citation-gb', label: 'GB/T 7714 引用格式' },
      { id: 'citation-apa', label: 'APA 引用格式' },
    ];

    return `
      <h2>🎯 第四步：特殊习惯</h2>
      <p>选择你在写作中的特殊要求（可多选）。</p>
      <div class="card">
        <div class="checkbox-group" id="habits">
          ${habits.map(h => `
            <label class="checkbox-item">
              <input type="checkbox" value="${h.id}" onchange="this.parentElement.classList.toggle('checked', this.checked)">
              <span>${h.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep()">← 上一步</button>
        <button class="btn btn-primary" onclick="nextStep()">下一步 →</button>
      </div>
    `;
  }

  private renderProjectStep(): string {
    return `
      <h2>🚀 第五步：创建第一个项目</h2>
      <p>告诉 AI 你目前在做什么项目。</p>
      <div class="card">
        <div class="form-group">
          <label>项目名称</label>
          <input type="text" id="projectName" placeholder="例如：TeamFlow">
        </div>
        <div class="form-group">
          <label>目标用户</label>
          <input type="text" id="targetUsers" placeholder="例如：企业管理员、中小企业">
        </div>
        <div class="form-group">
          <label>核心功能（用逗号分隔）</label>
          <input type="text" id="coreFeatures" placeholder="例如：项目管理、团队协作、文件共享">
        </div>
      </div>
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="prevStep()">← 上一步</button>
        <button class="btn btn-primary" onclick="finish()">完成设置 ✓</button>
      </div>
    `;
  }

  private renderCompleteStep(): string {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <h2>设置完成！</h2>
        <p>Remember Me 已记住你的偏好。</p>
        <p>现在你可以开始与 AI 协作了，它会记住你的风格和项目背景。</p>
        <div class="btn-group" style="justify-content: center;">
          <button class="btn btn-primary" onclick="postMessage('close')">开始体验</button>
        </div>
      </div>
    `;
  }

  protected handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const msg = message as Record<string, unknown>;

    switch (msg.command) {
      case 'nextStep':
        this.saveCurrentStepData(msg.data as Record<string, unknown>);
        this.currentStep++;
        if (this.panel) {
          this.panel.webview.html = this.getHtml(this.panel.webview);
        }
        break;

      case 'prevStep':
        this.currentStep = Math.max(0, this.currentStep - 1);
        if (this.panel) {
          this.panel.webview.html = this.getHtml(this.panel.webview);
        }
        break;

      case 'finish':
        this.saveCurrentStepData(msg.data as Record<string, unknown>);
        this.saveProfile().then(success => {
          if (success) {
            this.currentStep++;
            if (this.panel) {
              this.panel.webview.html = this.getHtml(this.panel.webview);
            }
            vscode.window.showInformationMessage('🎉 Remember Me 设置完成！');
          }
        });
        break;

      case 'close':
        this.panel?.dispose();
        break;
    }
  }

  private saveCurrentStepData(data: Record<string, unknown> | undefined): void {
    if (!data) {
      return;
    }

    switch (this.currentStep) {
      case 0:
        this.collectedData = {
          ...this.collectedData,
          identity: {
            role: data.role as IdentityInfo['role'],
            experience: data.experience as IdentityInfo['experience'],
            industry: data.industry as IdentityInfo['industry'],
            background: data.background as IdentityInfo['background'],
          },
        };
        break;

      case 1:
        // 文档类型暂存到 context
        break;

      case 2:
        this.collectedData = {
          ...this.collectedData,
          style: {
            documentStructure: data.documentStructure as StyleInfo['documentStructure'],
            detailLevel: data.detailLevel as StyleInfo['detailLevel'],
            language: data.language as StyleInfo['language'],
            tone: data.tone as StyleInfo['tone'],
            responseStyle: data.responseStyle as StyleInfo['responseStyle'],
            specialHabits: [],
          },
        };
        break;

      case 3:
        if ((this.collectedData as any).style) {
          (this.collectedData as any).style.specialHabits = (data.habits as string[]) || [];
        }
        break;

      case 4:
        this.collectedData = {
          ...this.collectedData,
          projectName: data.projectName as string,
          targetUsers: data.targetUsers as string,
          coreFeatures: data.coreFeatures as string,
        };
        break;
    }
  }

  private async saveProfile(): Promise<boolean> {
    const storage = getStorage();
    const now = new Date().toISOString();

    const profile: Profile = {
      id: `profile-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      identity: (this.collectedData as any).identity!,
      style: (this.collectedData as any).style!,
    };

    const success = storage.write(profile, 'profile.json');

    // 同时创建第一个项目
    if ((this.collectedData as any).projectName) {
      const projectId = (this.collectedData as any).projectName.toLowerCase().replace(/\s+/g, '-');
      storage.write({
        id: projectId,
        name: (this.collectedData as any).projectName,
        createdAt: now,
        updatedAt: now,
        targetUsers: (this.collectedData as any).targetUsers || '',
        coreFeatures: (this.collectedData as any).coreFeatures || '',
        decisions: [],
        terminology: [],
        competitors: [],
      }, 'projects', projectId, 'context.json');
    }

    // 通知状态栏更新
    await vscode.commands.executeCommand('rememberMe.profileUpdated', profile);

    return success;
  }
}
