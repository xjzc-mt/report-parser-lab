# LLM Lab (llm-lab)

本文件为 Claude Code 在此代码库中工作时提供指引。

## 常用命令

```bash
npm run dev       # 启动 Vite 开发服务器
npm test          # 运行 Node 原生测试
npm run build     # 生产环境构建
npm run preview   # 预览生产构建结果
```

提交或交付前至少运行 `npm test` 和 `npm run build`。

## 项目定位

LLM Lab 是一个纯浏览器端 React 应用，无后端服务。目标是建设通用 LLM 工程化实验平台，当前围绕 PDF/Excel 文件解析、Prompt 快速迭代、模型结果验收、Prompt 自动优化、线上验证和数据预处理形成闭环。

## 主要入口

- `src/App.jsx`：顶层导航、全局模型设置、线上验证状态。
- `src/components/TestSetWorkbench.jsx`：测试集工作台容器，负责三级页面切换、Prompt 资产库和跨页面上下文传递。
- `src/components/FullFlowMode.jsx`：Prompt 快速迭代。
- `src/components/QuickValidationMode.jsx`：模型结果验收。
- `src/components/QuickOptimizationMode.jsx`：Prompt 自动优化。
- `src/components/OnlineValidationWorkbench.jsx` / `src/components/ExtractorTab.jsx`：线上验证工作台。
- `src/components/DataPreprocessingWorkbench.jsx`：数据预处理工作台。
- `src/components/modelPresets/`：模型预设管理。
- `src/components/promptAssets/`：Prompt 资产库。
- `src/services/`：LLM 调用、文件解析、导出、持久化和业务流程。
- `src/utils/`：纯计算、状态归一化和视图模型。
- `tests/`：单元测试。

## 模型配置

优先使用 `.env` 中的 `VITE_PLATFORM_DEFAULT_*` 配置平台默认模型：

```bash
VITE_PLATFORM_DEFAULT_VENDOR=gemini
VITE_PLATFORM_DEFAULT_TRANSPORT=gemini_native
VITE_PLATFORM_DEFAULT_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VITE_PLATFORM_DEFAULT_MODEL=gemini-2.5-pro
VITE_PLATFORM_DEFAULT_API_KEY=
VITE_PLATFORM_DEFAULT_PRESET_NAME=平台默认模型
```

也支持 `VITE_DEFAULT_GEMINI_*`、`VITE_DEFAULT_OPENAI_*`、`VITE_DEFAULT_ANTHROPIC_*`、`VITE_DEFAULT_ONEAPI_*`、`VITE_DEFAULT_GLM_*` 生成只读厂商默认预设。旧的 `VITE_GEMINI_API_KEY` 仍兼容，但后续不建议新增依赖。

## 持久化与安全

- 本项目主要使用 `localStorage` 和 `IndexedDB` 保存页面选择、模型预设、上传文件缓存、Prompt 资产、Prompt 优化历史等数据。
- `public/conversion.xlsx` 和 `public/synonyms.xlsx` 是初始化配置，不能删除。
- 不要提交真实 API Key、真实报告 PDF、导出结果或包含敏感信息的数据文件。

## 开发约束

- 新增用户可见文案统一使用中文。
- 页面组件只做编排和交互；复杂业务流程放到 `services/`；纯计算、映射和视图模型放到 `utils/`。
- 涉及 Prompt 自动优化、模型预设、导出结构或相似度逻辑时，需要同步检查相关测试和跨组件数据流。
