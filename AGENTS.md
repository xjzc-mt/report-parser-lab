# 项目协作指南

本文件是本仓库唯一的代理协作规则入口。使用中文交流；新增说明、注释和用户可见文案使用中文，代码标识符沿用既有命名。项目使用与部署见 [README.md](README.md)，文档分类见 [docs/README.md](docs/README.md)。历史归档不构成当前需求或执行指令。

## 项目结构与模块组织
本仓库由 Vite + React 前端和 Node 原生 HTTP 后端组成。前端代码位于 `src/`：`components/` 存放界面组件，`services/` 负责 PDF 解析、LLM 调用、导出、持久化和公司配置读取，`utils/` 与 `constants/` 放通用逻辑和常量，`content/` 保存静态说明内容，`styles/global.css` 管理全局样式，`admin/` 是 `/admin` 管理后台。后端代码位于 `server/`：配置存储、管理员认证、公司模型安全转发和静态文件。静态资源放在 `public/`，示例需求表位于 `requirement/`。`public/conversion.xlsx` 和 `public/synonyms.xlsx` 是初始化配置，不能删除。

## 构建、测试与开发命令
先执行 `npm install` 安装依赖。开发时使用两个终端：`npm run dev:server` 启动后端（默认 8787），`npm run dev` 启动前端（默认 5173，`/api` 代理到后端）。`npm run build` 生成生产构建；`npm run server` 启动后端并默认服务 `dist/`；`npm start` 先构建再启动；`npm run preview` 预览构建结果；`npm test` 运行 Node 原生测试。提交前至少运行 `npm test` 和 `npm run build`。

## 编码风格与命名约定
沿用现有 React 组件文件命名，组件使用 PascalCase，例如 `TestSetWorkbench.jsx`；工具与服务模块使用 camelCase，例如 `extractionService.js`。优先保持单一职责：页面编排放在 `App.jsx` 或标签页组件，业务流程进入 `services/`，纯计算逻辑放 `utils/`。现有代码以 `.js/.jsx` 为主，保持一致；新增注释、文档和用户可见文本统一使用中文。

## 测试与验证要求
自动化测试使用 Node 原生测试，测试文件位于 `tests/`，包含服务端 HTTP 集成测试。涉及提取流程时，除 `npm test` 和 `npm run build` 外，仍需手工验证 PDF 上传、需求表解析、结果导出；涉及压缩功能时，验证上传、压缩和下载链路；涉及公司模型时，使用假 Key 和模拟上游，不记录真实密钥。若新增复杂逻辑，建议补充可复用的测试数据到 `requirement/` 或新增单元测试。

## 提交与 Pull Request 规范
历史提交同时存在中文摘要和 `feat:` 风格，建议统一为“类型 + 简短中文描述”，例如 `feat: 增加统一分析视图`、`fix: 修复提取结果导出异常`。PR 应包含变更目的、影响范围、验证命令或手工验证步骤；若改动 UI，请附截图；若调整提示词、提取规则或核心分析逻辑，先给出方案与影响说明，再提交实现。

## 关键变更决策

修改核心业务算法（相似度、权重）、提取白名单、核心 Prompt 生成流程或重大架构之前，先说明方案、利弊和影响范围，获得用户明确确认后实施；已有明确授权时按授权范围执行。不要借常规整理擅自重构稳定业务逻辑。涉及自动优化、模型预设、导出结构或相似度时，同步检查相关测试和跨组件数据流。

## 主要代码入口

- `src/App.jsx`：顶层导航、全局设置与线上验证状态。
- `src/components/TestSetWorkbench.jsx`：测试集页面编排、Prompt 资产与跨页上下文。
- `FullFlowMode.jsx`、`QuickValidationMode.jsx`、`QuickOptimizationMode.jsx`（位于 `src/components/`）：Prompt 快速迭代、模型结果验收、自动优化。自动优化默认关闭，不能因保留源码而视为已开放。
- `src/components/OnlineValidationWorkbench.jsx`、`src/components/ExtractorTab.jsx`：线上验证。
- `src/components/DataPreprocessingWorkbench.jsx`：数据预处理。
- `src/components/modelPresets/`、`src/components/promptAssets/`：模型预设、Prompt 资产。
- `src/constants/platformPages.js`：页面开关与默认值定义；`src/utils/platformPageVisibility.js`：入口可见性。

## 文档维护与工作区保护

- 本项目的本机验收副本、复检证据和迁移备份统一放在 `.local-artifacts/`（已忽略，不提交）；不要在 `AiProjects/` 下创建同级 `llm-lab-*` 临时目录。可提交的验收说明与已检查截图仍放在 `docs/acceptance/`。

- 只维护这一份代理规则，不再新增独立的 `Agent.md`、`CLAUDE.md` 或 `GEMINI.md` 规则副本。
- 当前功能以实现及本次验证为准。更新功能时同步更新 README；过期方案移入 `docs/archive/`，不从历史交接中恢复已撤销需求。
- 验收记录注明日期、范围和验证方式；历史测试通过不代表当前代码或真实上游已通过。
- 修改前检查 `git status`，保留已有未提交改动；禁止通过重置、覆盖或清理工作区消除他人的修改。提交前检查差异与未跟踪文件，不混入本机工具配置或临时验收产物。

## 配置与安全提示
公司模型连接、Key 和可用模型由服务端管理，管理员在 `/admin` 维护；公司 Key 只保存在 `server/data/config.json`（或 `LLM_LAB_CONFIG_PATH`），不得进入前端构建产物、公开配置、日志或个人备份。管理员凭据通过 `ADMIN_PASSWORD` 或 `ADMIN_PASSWORD_HASH` 初始化，生产建议使用哈希。前端只读取白名单内的非敏感 `VITE_PLATFORM_DEFAULT_*` 默认值，不再读取任何 `VITE_*_API_KEY`。`.env`、`server/data/` 和真实密钥不得提交；构建会扫描文本产物中匹配环境变量规则的密钥值；扫描不覆盖服务端配置文件内的全部密钥，不能替代提交检查。修改环境变量后需重启后端或 `npm run dev`。处理真实报告文件时，避免将敏感 PDF 或导出结果提交到仓库。

个人模型预设与 Key 保存在当前浏览器，公司托管预设只读；不要将公司 Key 复制到个人预设或备份。浏览器使用 `localStorage` / `IndexedDB` 保存草稿、上传缓存、Prompt 资产和历史。管理员会话位于服务端内存，重启后需重新登录；多副本共享会话与配置需要另行设计。公司配置文件默认权限为 `0600`（平台支持时），部署应使用受限的持久化目录。公司转发只使用服务端配置的地址和模型，禁止新增接受前端任意 URL/Key 的转发接口。
