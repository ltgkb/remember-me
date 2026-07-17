/**
 * Remember Me - 内置模板数据
 * PRD Phase 3 要求的模板系统内置模板
 * 覆盖 8 大写作场景
 */

import type { DocumentTemplate } from './types';

export const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  // ─────────────────────────────────────────────
  // 1. PRD 标准模板
  // ─────────────────────────────────────────────
  {
    id: 'prd-standard',
    name: 'PRD 标准模板',
    description: '产品需求文档标准结构，适用于功能模块、整站改版、新特性等场景',
    category: 'prd',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '产品经理、技术团队',
      typicalLength: '5-15 页',
      language: '中文',
      difficulty: '标准',
    },
    structure: {
      preamble:
        '请根据用户提供的需求，撰写一份完整的 PRD（产品需求文档）。PRD 应清晰、可执行，便于设计与开发团队理解并实施。',
      sections: [
        {
          id: 'background',
          title: '1. 背景与目标',
          description: '说明为什么做这个功能，解决什么问题',
          required: true,
          prompt:
            '阐述项目/功能的背景、业务痛点、用户痛点。明确本次需求的总体目标和预期收益。必要时引用数据支撑。',
          memoryFocus: ['profile', 'project'],
          checklist: ['背景描述清晰', '目标可量化', '与项目核心功能对齐'],
        },
        {
          id: 'user-persona',
          title: '2. 用户画像与场景',
          description: '目标用户是谁，在什么场景下使用',
          required: true,
          prompt:
            '描述目标用户群体特征、使用场景、用户旅程。引用项目上下文中已定义的用户画像和术语。',
          memoryFocus: ['project'],
          checklist: ['用户角色定义准确', '场景描述具体', '引用项目术语表'],
        },
        {
          id: 'requirements',
          title: '3. 功能需求',
          description: '详细描述功能点，使用 MoSCoW 或优先级标注',
          required: true,
          prompt:
            '逐条列出功能需求。每条需求应包含：功能名称、功能描述、优先级（Must / Should / Could / Won\'t）、验收标准。',
          memoryFocus: ['style', 'project'],
          checklist: ['需求条目化', '优先级标注清晰', '验收标准可测试'],
        },
        {
          id: 'user-stories',
          title: '4. 用户故事',
          description: '以用户视角描述需求（可选，但强烈推荐）',
          required: false,
          prompt:
            '为每个核心功能编写用户故事，格式：「作为 <角色>，我希望 <目标>，以便 <收益>」。可附 Acceptance Criteria。',
          memoryFocus: ['project'],
          checklist: ['故事符合 INVEST 原则', 'Acceptance Criteria 清晰'],
        },
        {
          id: 'ui-ux',
          title: '5. 交互与原型',
          description: '页面流程、关键交互、原型说明',
          required: false,
          prompt:
            '描述页面结构、信息架构、关键交互流程。可包含流程图文字描述、原型链接占位。',
          memoryFocus: ['project'],
        },
        {
          id: 'competitor',
          title: '6. 竞品分析',
          description: '与竞品的对比分析（可选）',
          required: false,
          prompt:
            '对比主要竞品的同类功能，分析优劣势。引用项目上下文中定义的竞品信息。',
          memoryFocus: ['project'],
          checklist: ['引用项目已定义的竞品', '分析有数据或事实支撑'],
        },
        {
          id: 'acceptance',
          title: '7. 验收标准',
          description: '功能交付的验收条件',
          required: true,
          prompt:
            '逐条列出可验证的验收标准，每条标准应可通过测试或演示确认通过/不通过。',
          memoryFocus: ['style'],
          checklist: ['标准可量化或二元判断', '覆盖所有 Must 级需求'],
        },
        {
          id: 'timeline',
          title: '8. 排期与里程碑',
          description: '开发计划与关键时间节点',
          required: false,
          prompt:
            '建议迭代计划、里程碑、关键依赖项。可按 MVP / Phase 1 / Phase 2 分阶段。',
          memoryFocus: ['profile'],
        },
      ],
      appendix:
        '文档撰写完成后，请自检：1）是否覆盖所有必填章节；2）需求是否可测试；3）术语是否与项目定义一致。',
    },
    memoryConfig: {
      priority: ['project', 'style', 'profile'],
      requiredStyleHabits: ['MoSCoW优先级', '用户故事', '竞品对比', '验收标准', '用户旅程图'],
      projectContextKeys: ['decisions', 'terminology', 'competitors'],
    },
    tags: ['PRD', '产品需求', '功能文档', '标准'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 2. 商业计划书模板
  // ─────────────────────────────────────────────
  {
    id: 'business-plan',
    name: '商业计划书模板',
    description: '适用于融资路演、战略汇报、商业可行性分析等场景',
    category: 'business',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '投资人、合伙人、高管',
      typicalLength: '20-40 页',
      language: '中文',
      difficulty: '高级',
    },
    structure: {
      preamble:
        '请撰写一份专业的商业计划书。内容应逻辑严密、数据可信、说服力强，适合向投资人或高层汇报。',
      sections: [
        {
          id: 'executive-summary',
          title: '1. 执行摘要',
          description: '一页纸概括整个商业计划的核心内容',
          required: true,
          prompt:
            '用一页纸精炼概括：项目是什么、解决什么问题、市场多大、为什么是现在、团队优势、融资需求。语言要有冲击力。',
          memoryFocus: ['project', 'profile'],
        },
        {
          id: 'problem',
          title: '2. 问题与机会',
          description: '市场痛点与商业机会',
          required: true,
          prompt:
            '描述目标市场的核心痛点、现有解决方案的不足、市场缺口。引用数据和案例支撑。',
          memoryFocus: ['project'],
        },
        {
          id: 'solution',
          title: '3. 产品/服务方案',
          description: '你的解决方案是什么',
          required: true,
          prompt:
            '清晰描述产品/服务如何解决上述问题。包含核心功能、差异化优势、技术/服务壁垒。引用项目核心功能描述。',
          memoryFocus: ['project'],
          checklist: ['与项目上下文的核心功能一致', '差异化优势明确'],
        },
        {
          id: 'market',
          title: '4. 市场分析',
          description: 'TAM/SAM/SOM、市场趋势、增长预测',
          required: true,
          prompt:
            '分析目标市场的规模（TAM/SAM/SOM）、增长趋势、驱动因素。引用可靠数据源。',
          memoryFocus: ['project'],
          checklist: ['市场数据有来源', 'TAM/SAM/SOM 计算合理'],
        },
        {
          id: 'business-model',
          title: '5. 商业模式',
          description: '如何赚钱、定价策略、 unit economics',
          required: true,
          prompt:
            '详细描述盈利模式、收入来源、定价策略、客户获取成本（CAC）、生命周期价值（LTV）、LTV/CAC 比率。',
          memoryFocus: ['profile', 'project'],
        },
        {
          id: 'competition',
          title: '6. 竞争格局',
          description: '竞品分析、竞争壁垒、护城河',
          required: true,
          prompt:
            '绘制竞争格局图（可文字描述），分析主要竞争对手、市场份额、你的竞争优势和护城河。引用项目已定义的竞品信息。',
          memoryFocus: ['project'],
          checklist: ['引用项目已定义的竞品', '竞争优势可防御'],
        },
        {
          id: 'team',
          title: '7. 团队介绍',
          description: '核心团队背景与分工',
          required: false,
          prompt:
            '介绍核心团队成员的背景、经验、分工。强调团队与项目的匹配度。',
          memoryFocus: ['profile'],
        },
        {
          id: 'financials',
          title: '8. 财务预测',
          description: '3-5 年收入、成本、利润预测',
          required: true,
          prompt:
            '提供 3-5 年的财务预测，包括收入预测、成本结构、利润预测、关键假设。可用表格形式呈现。',
          memoryFocus: ['profile'],
          checklist: ['预测有合理假设支撑', '包含敏感性分析'],
        },
        {
          id: 'funding',
          title: '9. 融资计划',
          description: '融资需求、资金用途、里程碑',
          required: false,
          prompt:
            '说明本轮融资金额、资金用途分配、关键里程碑、退出机制。',
          memoryFocus: ['project'],
        },
      ],
      appendix:
        '商业计划书应数据驱动、逻辑闭环。确保每个数字都有假设支撑，每个论断都有证据支撑。',
    },
    memoryConfig: {
      priority: ['project', 'profile', 'style'],
      requiredStyleHabits: ['财务预测', '市场分析', '竞品对比'],
      projectContextKeys: ['competitors', 'targetUsers', 'coreFeatures'],
    },
    tags: ['商业计划', '融资', '路演', 'BP'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 3. 学术论文模板
  // ─────────────────────────────────────────────
  {
    id: 'thesis-template',
    name: '学术论文模板',
    description: '适用于期刊论文、学位论文、学术综述等场景',
    category: 'academic',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '学术评审、同行研究者',
      typicalLength: '8-20 页（期刊）/ 50-100 页（学位论文）',
      language: '中文/英文',
      difficulty: '高级',
    },
    structure: {
      preamble:
        '请撰写符合学术规范的论文。内容应逻辑严谨、论证充分、引用规范。使用用户偏好的引用格式。',
      sections: [
        {
          id: 'abstract',
          title: '1. 摘要（Abstract）',
          description: '中英文摘要，概括研究目的、方法、结果、结论',
          required: true,
          prompt:
            '撰写结构化摘要（Background, Methods, Results, Conclusion），中文 300-500 字，英文 200-300 词。关键词 3-5 个。',
          memoryFocus: ['profile'],
        },
        {
          id: 'introduction',
          title: '2. 引言（Introduction）',
          description: '研究背景、问题陈述、研究意义、论文结构',
          required: true,
          prompt:
            '从宏观到微观引出研究问题：领域背景 → 现有研究不足 → 本文研究问题 → 研究意义 → 论文结构概述。',
          memoryFocus: ['profile', 'project'],
        },
        {
          id: 'related-work',
          title: '3. 相关工作/文献综述（Related Work）',
          description: '系统综述相关研究，定位本文贡献',
          required: true,
          prompt:
            '按主题或时间线组织文献综述。对每类相关工作分析其贡献与不足，最后明确本文与已有工作的区别和创新点。使用规范引用格式。',
          memoryFocus: ['profile', 'project'],
          checklist: ['引用格式统一', '综述有逻辑线索', '明确本文定位'],
        },
        {
          id: 'methodology',
          title: '4. 方法论（Methodology）',
          description: '研究方法、实验设计、技术路线',
          required: true,
          prompt:
            '详细描述研究方法、实验设计、数据集、评估指标、实现细节。确保可复现。引用第一章定义的理论框架。',
          memoryFocus: ['profile', 'project'],
          checklist: ['方法描述足够详细以复现', '评估指标与项目定义一致'],
        },
        {
          id: 'experiments',
          title: '5. 实验与结果（Experiments & Results）',
          description: '实验结果、数据分析、可视化',
          required: true,
          prompt:
            '呈现实验结果，包含表格、图表文字描述。进行消融实验、对比实验、统计分析。讨论结果的合理性和局限性。',
          memoryFocus: ['profile'],
        },
        {
          id: 'discussion',
          title: '6. 讨论（Discussion）',
          description: '结果解读、与已有工作对比、局限性',
          required: true,
          prompt:
            '深入讨论实验结果的含义、与已有工作的对比、本研究的优势与局限、未来改进方向。',
          memoryFocus: ['project'],
        },
        {
          id: 'conclusion',
          title: '7. 结论（Conclusion）',
          description: '总结贡献、展望未来',
          required: true,
          prompt:
            '总结主要贡献（不要重复结果），指出研究局限性，提出未来研究方向。',
          memoryFocus: ['project'],
        },
        {
          id: 'references',
          title: '8. 参考文献（References）',
          description: '规范格式的参考文献列表',
          required: true,
          prompt:
            '整理所有引用文献，使用用户偏好的引用格式（APA / MLA / GB/T 7714 等）。确保格式统一、信息完整。',
          memoryFocus: ['style'],
          checklist: ['引用格式统一', '无遗漏引用', '信息完整'],
        },
      ],
      appendix:
        '论文应遵循学术诚信，所有引用必须标注来源。确保图表清晰、公式编号连贯、术语全文一致。',
    },
    memoryConfig: {
      priority: ['profile', 'style', 'project'],
      requiredStyleHabits: ['引用格式规范'],
      projectContextKeys: ['terminology', 'decisions'],
    },
    tags: ['论文', '学术', '期刊', '学位论文'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 4. 市场调研报告模板
  // ─────────────────────────────────────────────
  {
    id: 'market-research',
    name: '市场调研报告模板',
    description: '适用于竞品分析、用户调研、行业研究等场景',
    category: 'research',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '产品团队、管理层',
      typicalLength: '10-30 页',
      language: '中文',
      difficulty: '标准',
    },
    structure: {
      preamble:
        '请撰写一份系统的市场调研报告。数据驱动、结论清晰、建议可执行。',
      sections: [
        {
          id: 'overview',
          title: '1. 调研概述',
          description: '调研目的、方法、范围、样本说明',
          required: true,
          prompt:
            '说明本次调研的背景目的、采用的调研方法（问卷/访谈/数据分析等）、样本规模和特征、时间范围。',
          memoryFocus: ['project'],
        },
        {
          id: 'market-landscape',
          title: '2. 市场现状',
          description: '市场规模、增长趋势、政策环境',
          required: true,
          prompt:
            '分析目标市场的整体规模、增长率、发展阶段、政策环境和关键趋势。',
          memoryFocus: ['project'],
        },
        {
          id: 'user-insights',
          title: '3. 用户洞察',
          description: '用户画像、需求分析、行为数据',
          required: true,
          prompt:
            '呈现用户调研的核心发现：用户画像、痛点排序、需求优先级、使用场景、满意度分析。',
          memoryFocus: ['project', 'profile'],
        },
        {
          id: 'competitor-analysis',
          title: '4. 竞品分析',
          description: '竞品功能、定位、优劣势对比',
          required: true,
          prompt:
            '对比分析主要竞品：产品定位、核心功能、优劣势、用户评价、市场份额。使用矩阵或表格呈现。引用项目已定义的竞品。',
          memoryFocus: ['project'],
          checklist: ['引用项目已定义的竞品', '对比维度一致'],
        },
        {
          id: 'swot',
          title: '5. SWOT 分析',
          description: '优势、劣势、机会、威胁',
          required: false,
          prompt:
            '基于调研结果，进行 SWOT 分析。每个维度至少列出 3 条，并给出证据支撑。',
          memoryFocus: ['project'],
        },
        {
          id: 'findings',
          title: '6. 关键发现',
          description: '核心结论和数据洞察',
          required: true,
          prompt:
            '总结 3-5 条最重要的发现，每条应有数据支撑。使用「发现 → 证据 → 启示」的结构。',
          memoryFocus: ['style'],
        },
        {
          id: 'recommendations',
          title: '7. 策略建议',
          description: '基于调研结论的可执行建议',
          required: true,
          prompt:
            '提出 3-5 条具体、可执行的策略建议。每条建议应包含：行动项、预期效果、优先级、所需资源。',
          memoryFocus: ['profile', 'project'],
        },
      ],
      appendix: '报告应数据可信、结论明确、建议落地。重要发现需有原始数据或引用来源支撑。',
    },
    memoryConfig: {
      priority: ['project', 'style', 'profile'],
      requiredStyleHabits: ['竞品对比', '数据图表'],
      projectContextKeys: ['competitors', 'targetUsers', 'terminology'],
    },
    tags: ['调研', '市场', '竞品', '用户研究'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 5. 活动策划方案模板
  // ─────────────────────────────────────────────
  {
    id: 'activity-plan',
    name: '活动策划方案模板',
    description: '适用于线上/线下活动、营销 campaign、发布会等场景',
    category: 'activity',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '运营团队、市场团队',
      typicalLength: '5-10 页',
      language: '中文',
      difficulty: '入门',
    },
    structure: {
      preamble:
        '请撰写一份完整的活动策划方案。方案应有创意、可执行、数据可追踪。',
      sections: [
        {
          id: 'activity-overview',
          title: '1. 活动概述',
          description: '活动背景、目标、主题',
          required: true,
          prompt:
            '说明活动背景、核心目标（品牌/转化/拉新/留存）、活动主题和 slogan。目标需量化。',
          memoryFocus: ['project', 'profile'],
        },
        {
          id: 'target-audience',
          title: '2. 目标人群',
          description: '活动的目标受众画像',
          required: true,
          prompt:
            '描述目标受众的人口统计特征、行为特征、兴趣偏好。引用项目已定义的目标用户画像。',
          memoryFocus: ['project'],
        },
        {
          id: 'activity-form',
          title: '3. 活动形式与玩法',
          description: '活动机制、玩法设计、创意亮点',
          required: true,
          prompt:
            '详细描述活动形式、参与机制、奖励设置、裂变设计、创意亮点。确保玩法简单易懂、参与门槛低。',
          memoryFocus: ['profile'],
        },
        {
          id: 'timeline-detail',
          title: '4. 活动排期',
          description: '预热期、正式期、返场期的时间节点',
          required: true,
          prompt:
            '列出活动各阶段的时间节点、关键动作、负责人。可用甘特图文字描述。',
          memoryFocus: ['profile'],
        },
        {
          id: 'channel',
          title: '5. 渠道与推广',
          description: '投放渠道、内容规划、KOL 合作',
          required: false,
          prompt:
            '列出活动推广渠道、各渠道的内容规划、预算分配、KOL/达人合作计划。',
          memoryFocus: ['project'],
        },
        {
          id: 'budget',
          title: '6. 预算规划',
          description: '活动预算明细与 ROI 预估',
          required: true,
          prompt:
            '列出活动预算明细（奖品、投放、人力、物料等），计算预估 ROI 和各项成本。',
          memoryFocus: ['profile'],
        },
        {
          id: 'risk',
          title: '7. 风险预案',
          description: '潜在风险与应对措施',
          required: false,
          prompt:
            '识别活动可能面临的风险（技术/舆情/合规/天气等），并给出应对措施和责任人。',
          memoryFocus: ['profile'],
        },
        {
          id: 'metrics',
          title: '8. 效果评估',
          description: '核心指标、数据追踪、复盘框架',
          required: true,
          prompt:
            '定义活动的核心 KPI（曝光/参与/转化/留存等）、数据追踪方式、复盘框架。',
          memoryFocus: ['style'],
        },
      ],
      appendix: '活动策划要兼顾创意与可执行性。所有数字目标需有历史数据或行业基准支撑。',
    },
    memoryConfig: {
      priority: ['project', 'profile', 'style'],
      requiredStyleHabits: [],
      projectContextKeys: ['targetUsers', 'coreFeatures'],
    },
    tags: ['活动', '运营', '营销', '策划'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 6. 设计说明文档模板
  // ─────────────────────────────────────────────
  {
    id: 'design-spec',
    name: '设计说明文档模板',
    description: '适用于设计系统、组件说明、UI/UX 设计文档等场景',
    category: 'design',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '设计师、前端开发',
      typicalLength: '3-10 页/组件',
      language: '中文',
      difficulty: '标准',
    },
    structure: {
      preamble:
        '请撰写清晰、精确的设计说明文档。开发团队应能根据文档准确还原设计。',
      sections: [
        {
          id: 'design-overview',
          title: '1. 设计概述',
          description: '设计目标、使用场景、设计原则',
          required: true,
          prompt:
            '说明本次设计的目标、适用场景、遵循的设计原则（简洁/一致/可访问等）。',
          memoryFocus: ['project'],
        },
        {
          id: 'design-system',
          title: '2. 设计规范',
          description: '色彩、字体、间距、圆角等 Token',
          required: true,
          prompt:
            '列出设计系统的核心 Token：主色/辅色/中性色、字体层级、间距系统、圆角规范、阴影规范。',
          memoryFocus: ['profile'],
          checklist: ['Token 命名规范', '数值精确'],
        },
        {
          id: 'components',
          title: '3. 组件说明',
          description: '各组件的规格、状态、交互',
          required: true,
          prompt:
            '逐组件说明：组件名称、功能描述、尺寸规格、各状态（默认/悬停/禁用/错误）、交互行为、使用示例。',
          memoryFocus: ['project'],
        },
        {
          id: 'interaction',
          title: '4. 交互说明',
          description: '动效、手势、状态流转',
          required: false,
          prompt:
            '描述关键交互：页面转场、按钮反馈、表单验证、加载状态、空状态等。',
          memoryFocus: ['project'],
        },
        {
          id: 'responsive',
          title: '5. 响应式/适配规则',
          description: '不同断点下的布局变化',
          required: false,
          prompt:
            '说明各断点（移动端/平板/桌面端）的布局变化和适配规则。',
          memoryFocus: ['profile'],
        },
        {
          id: 'accessibility',
          title: '6. 可访问性要求',
          description: 'WCAG 标准、色彩对比度、键盘导航',
          required: false,
          prompt:
            '列出可访问性要求：色彩对比度标准、键盘导航支持、屏幕阅读器适配、焦点管理。',
          memoryFocus: ['style'],
        },
      ],
      appendix: '设计文档应精确到像素，开发能直接按文档还原。所有 Token 值应与设计系统一致。',
    },
    memoryConfig: {
      priority: ['style', 'project', 'profile'],
      requiredStyleHabits: [],
      projectContextKeys: ['terminology', 'decisions'],
    },
    tags: ['设计', 'UI', 'UX', '组件'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 7. 技术方案文档模板
  // ─────────────────────────────────────────────
  {
    id: 'tech-spec',
    name: '技术方案文档模板',
    description: '适用于架构设计、API 设计、技术选型、系统改造等场景',
    category: 'tech',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '技术团队、架构师',
      typicalLength: '5-20 页',
      language: '中文',
      difficulty: '高级',
    },
    structure: {
      preamble:
        '请撰写一份严谨、可落地的技术方案文档。方案应包含充分的分析和明确的决策依据。',
      sections: [
        {
          id: 'tech-background',
          title: '1. 背景与目标',
          description: '技术背景、业务驱动、目标',
          required: true,
          prompt:
            '说明技术方案的业务背景、要解决的问题、预期目标（性能/可用性/扩展性等）。引用项目已确定的技术决策。',
          memoryFocus: ['project'],
          checklist: ['引用项目已确定的技术决策'],
        },
        {
          id: 'tech-requirements',
          title: '2. 需求分析',
          description: '功能需求与非功能需求',
          required: true,
          prompt:
            '列出功能需求（FR）和非功能需求（NFR）：性能指标、可用性指标、安全要求、兼容性要求。',
          memoryFocus: ['project'],
        },
        {
          id: 'architecture',
          title: '3. 架构设计',
          description: '系统架构、模块划分、数据流',
          required: true,
          prompt:
            '描述系统整体架构、模块划分、各模块职责、数据流向、接口契约。可用文字描述架构图。',
          memoryFocus: ['project'],
        },
        {
          id: 'tech-stack',
          title: '4. 技术选型',
          description: '技术栈、选型依据、对比分析',
          required: true,
          prompt:
            '列出技术选型方案，每个选型应包含：候选方案对比、选型依据、风险分析。引用项目已确定的技术栈。',
          memoryFocus: ['project'],
          checklist: ['引用项目已确定的技术决策', '选型有量化依据'],
        },
        {
          id: 'api-design',
          title: '5. 接口设计',
          description: 'API 定义、协议、数据模型',
          required: false,
          prompt:
            '定义核心 API：接口路径、请求/响应格式、状态码、错误处理、认证方式。',
          memoryFocus: ['project'],
        },
        {
          id: 'data-model',
          title: '6. 数据模型',
          description: '数据库设计、缓存策略、数据流',
          required: false,
          prompt:
            '描述数据模型：ER 图文字描述、核心表结构、索引设计、缓存策略、数据一致性方案。',
          memoryFocus: ['project'],
        },
        {
          id: 'deployment',
          title: '7. 部署与运维',
          description: '部署架构、CI/CD、监控告警',
          required: false,
          prompt:
            '描述部署方案：环境划分、部署流程、回滚策略、监控指标、告警规则。',
          memoryFocus: ['project'],
        },
        {
          id: 'risk-mitigation',
          title: '8. 风险与应对',
          description: '技术风险、性能风险、安全风险',
          required: true,
          prompt:
            '识别技术风险并给出应对方案：性能瓶颈、单点故障、数据安全、兼容性、回滚方案。',
          memoryFocus: ['profile'],
        },
        {
          id: 'tech-timeline',
          title: '9. 实施计划',
          description: '开发排期、里程碑、依赖项',
          required: false,
          prompt:
            '列出实施计划：任务拆分、排期、里程碑、依赖项、验收标准。',
          memoryFocus: ['profile'],
        },
      ],
      appendix:
        '技术方案应严谨可落地。所有技术决策应有数据支撑或业界实践验证。关键方案应提供备选和回退策略。',
    },
    memoryConfig: {
      priority: ['project', 'style', 'profile'],
      requiredStyleHabits: [],
      projectContextKeys: ['decisions', 'terminology'],
    },
    tags: ['技术方案', '架构', 'API', '设计文档'],
    isBuiltIn: true,
  },

  // ─────────────────────────────────────────────
  // 8. 汇报材料模板
  // ─────────────────────────────────────────────
  {
    id: 'report',
    name: '汇报材料模板',
    description: '适用于周报、月报、项目汇报、战略汇报等场景',
    category: 'report',
    version: '1.0.0',
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
    meta: {
      targetAudience: '管理层、跨部门团队',
      typicalLength: '3-10 页',
      language: '中文',
      difficulty: '入门',
    },
    structure: {
      preamble:
        '请撰写简洁有力的汇报材料。结论先行、数据支撑、建议明确。',
      sections: [
        {
          id: 'executive-summary-report',
          title: '1. 核心结论',
          description: '一页纸核心结论，结论先行',
          required: true,
          prompt:
            '用 3-5 句话概括汇报的核心结论。结论先行，直接回答「现状如何、问题是什么、建议怎么做」。',
          memoryFocus: ['style', 'profile'],
        },
        {
          id: 'situation',
          title: '2. 现状回顾',
          description: '当前进展、关键数据、完成情况',
          required: true,
          prompt:
            '呈现当前进展和关键数据。使用数据图表文字描述，突出核心指标变化。',
          memoryFocus: ['project', 'style'],
          checklist: ['数据有对比（环比/同比）', '突出异常点'],
        },
        {
          id: 'achievements',
          title: '3. 关键成果',
          description: '已完成的重要事项和成果',
          required: true,
          prompt:
            '列出关键成果，每条成果包含：事项、量化影响、与目标的对比。按重要性排序。',
          memoryFocus: ['project'],
        },
        {
          id: 'issues',
          title: '4. 问题与风险',
          description: '当前面临的问题、阻塞、风险',
          required: true,
          prompt:
            '列出当前问题和风险，每条包含：问题描述、影响范围、严重程度、已采取/建议的应对措施。',
          memoryFocus: ['project'],
        },
        {
          id: 'next-steps',
          title: '5. 下阶段计划',
          description: '下一步行动、时间节点、资源需求',
          required: true,
          prompt:
            '列出下阶段核心任务、时间节点、负责人、资源需求、预期产出。',
          memoryFocus: ['profile'],
        },
        {
          id: 'support-needed',
          title: '6. 需协调事项',
          description: '需要管理层或跨部门支持的事项',
          required: false,
          prompt:
            '列出需要协调或决策的事项，明确需要的支持类型和预期效果。',
          memoryFocus: ['project'],
        },
      ],
      appendix:
        '汇报材料应简洁有力，每页只说一件事。多用数据，少用文字。结论先行，建议具体。',
    },
    memoryConfig: {
      priority: ['style', 'project', 'profile'],
      requiredStyleHabits: ['数据图表', 'SWOT分析'],
      projectContextKeys: ['decisions', 'targetUsers'],
    },
    tags: ['汇报', '周报', '月报', '项目汇报'],
    isBuiltIn: true,
  },
];
