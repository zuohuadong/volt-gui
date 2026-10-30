import type { DshSkill } from "./dsh-client";
import type { Locale } from "./i18n";

const BUILTIN_SKILLS_ZH: Record<string, readonly [string, string]> = {
  "browser-skill": ["浏览器操作", "通过插件提供的浏览器工具读取网页、填写表单、管理标签页、排查页面问题和测试界面，使用用户已登录的浏览器会话。"],
  "diagnose-windows-sandbox-acl": ["Windows 沙箱权限诊断", "用于工作区读写出现非预期拒绝访问时，检查目标路径与父目录，并修复已确认的访问控制问题；正常的沙箱权限限制不需要修复。"],
  "office-docx": ["Word 文档", "创建、阅读、编辑和检查 Word 文档，包括报告、信件和格式化表格。执行办公命令前加载此技能；除非用户明确选择其他方式，否则仅使用内置 LibreOffice。"],
  "office-pptx": ["演示文稿", "创建、阅读、编辑和检查 PowerPoint 演示文稿，包括文字、表格、图片和图表。执行办公命令前加载此技能；除非用户明确选择其他方式，否则仅使用内置 LibreOffice。"],
  "office-xlsx": ["Excel 工作簿", "读取、创建和修改工作簿、公式与格式，分析表格数据。执行办公命令前加载；仅在检查格式或布局时进行视觉检查；除非用户明确选择其他方式，否则仅使用内置 LibreOffice。"],
  "volt-gui-design-language": ["桌面界面设计规范", "检查桌面展示层边界，沿用官方运行时，避免引入重复的后端、权限或持久化实现。"],
  "prompt-evaluation": ["提示词评估", "设计和评估提示词、智能体工具策略、模型路由与质量测试。"],
  "data-reporting-analytics": ["数据分析与报表", "分析业务、产品和运营数据，整理指标、趋势与报告。"],
  "rag-knowledge-management": ["知识库管理", "管理文档导入、分块、检索质量、引用、权限和资料更新。"],
  "sql-database-development": ["数据库开发", "设计数据库结构、查询、迁移、索引与事务，检查数据完整性。"],
  "bunjs-development": ["Bun 应用开发", "开发和检查 Bun 应用、脚本、工具、测试与运行时兼容性。"],
  "c-systems-development": ["C 与 C++ 系统开发", "开发底层系统、嵌入式程序、协议与性能敏感模块。"],
  "go-service-development": ["Go 服务开发", "开发网络服务，检查并发、数据库访问、性能和可靠性。"],
  "java-backend-development": ["Java 后端开发", "开发企业后端服务，检查接口、持久化、并发与运行性能。"],
  "nodejs-backend-development": ["Node.js 后端开发", "开发接口、脚本与服务，检查异步处理、流、依赖和安全性。"],
  "python-development": ["Python 开发", "开发自动化脚本、接口、数据处理程序与测试。"],
  "rust-development": ["Rust 开发", "检查所有权、异步处理、错误处理、性能与系统安全。"],
  "svelte-development": ["Svelte 界面开发", "开发响应式界面、组件、路由、表单与测试。"],
  "typescript-development": ["TypeScript 开发", "检查类型安全、接口约定、模块边界与测试。"],
  "vue-development": ["Vue 界面开发", "开发组件、状态管理、路由、表单和类型安全的界面。"],
  "code-review": ["代码审查", "检查缺陷、行为回归、安全风险、可维护性和缺失测试。"],
  "semiconductor-ate-test-plan": ["半导体自动测试计划", "制定器件测试策略、覆盖矩阵、限值、保护带和量产验证计划。"],
  "semiconductor-failure-analysis": ["半导体失效分析", "从测试症状和实验数据梳理失效假设、分析计划与验证证据。"],
  "semiconductor-test-program-review": ["半导体测试程序审查", "检查测试流程、限值、分档、数据记录、多工位行为和量产风险。"],
  "semiconductor-yield-spc": ["半导体良率与过程控制", "分析晶圆、批次、分档和良率，进行过程能力与异常趋势分析。"],
  "mcp-tool-builder": ["外部工具集成", "构建邮件、日历、数据库和企业系统的工具接口，检查权限与审计。"],
  "office-workflow-assistant": ["办公工作助手", "整理文档、邮件、会议纪要、内部政策和日常工作资料。"],
  "cicd-release-management": ["构建与发布管理", "设计和检查持续集成、版本发布、回滚与交付验证流程。"],
  "devops-observability": ["运维与可观测性", "分析服务故障、日志、指标、追踪、容量与部署问题。"],
  "api-design": ["接口设计", "设计接口、错误处理、分页、鉴权、幂等性和开发者体验。"],
  "architecture-design": ["系统架构设计", "评估模块边界、数据流、可靠性、扩展性与迁移计划。"],
  "product-requirements": ["产品需求分析", "整理产品需求、用户故事、验收标准、路线图和发布说明。"],
  "test-plan-and-qa": ["测试计划与质量验证", "制定测试计划、回归矩阵、验收标准和发布检查清单。"],
  "security-review": ["安全审查", "检查鉴权、密钥、注入、文件上传、依赖和信任边界风险。"],
  "frontend-ux-review": ["界面体验审查", "评估易用性、无障碍、响应式布局、信息组织和操作效率。"],
  "document-reading": ["文档阅读", "阅读办公文档，进行带来源的摘要、比较和信息提取。"],
  "email-drafting": ["邮件起草", "起草、润色和回复邮件，核对事实、承诺与附件。"],
  "meeting-minutes": ["会议纪要", "整理会议记录、决策、待办和未决事项。"],
  "spreadsheet-analysis": ["表格分析", "清洗和分析表格数据，生成可复核的汇总、指标和报表。"],
  "weekly-report": ["周报汇总", "根据指定期间的工作记录整理成果、风险与下一步计划。"],
};

export function skillDisplayCopy(skill: DshSkill, locale: Locale): DshSkill & { displayName: string } {
  const translated = locale === "zh-CN" ? BUILTIN_SKILLS_ZH[skill.name] : undefined;
  if (!translated) return { ...skill, displayName: skill.name };
  return { ...skill, displayName: translated[0], description: translated[1] };
}

export function filterLocalizedSkills(skills: ReturnType<typeof skillDisplayCopy>[], query: string) {
  const search = query.trim().toLowerCase();
  return skills.filter((skill) => `${skill.name} ${skill.displayName} ${skill.description}`.toLowerCase().includes(search));
}
