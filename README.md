# LLM Lab

LLM 工程实验室。当前项目是一个纯浏览器端的 Vite + React 应用，用于沉淀 LLM 工程化落地中的文件解析、Prompt 迭代、模型结果验收、Prompt 自动优化、线上验证和数据预处理能力。

## 功能结构

- 测试集工作台：包含 `Prompt快速迭代`、`模型结果验收`、`Prompt自动优化`。用于围绕测试集完成 Prompt 试跑、结果对齐、误差分析和优化闭环。
- 线上验证工作台：保留原有 PDF 摘录流程，作为线上验证入口继续使用。
- 数据预处理工作台：包含 `Chunking测试`、`PDF压缩`、`Token统计`。用于处理输入文件、估算成本和验证切片策略。
- 说明文档：维护当前平台的操作逻辑、工程边界和数据流说明。

## 本地运行

```bash
npm install
npm run dev
```

常用验证命令：

```bash
npm test
npm run build
npm run preview
```

## 模型配置

模型通过“预设”统一管理。页面只选择预设名称，不直接维护 API Key。

平台默认模型可以在 `.env` 中配置：

```bash
VITE_PLATFORM_DEFAULT_VENDOR=gemini
VITE_PLATFORM_DEFAULT_TRANSPORT=gemini_native
VITE_PLATFORM_DEFAULT_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VITE_PLATFORM_DEFAULT_MODEL=gemini-2.5-pro
VITE_PLATFORM_DEFAULT_API_KEY=your_key
VITE_PLATFORM_DEFAULT_PRESET_NAME=平台默认模型
# 可选：高级请求参数 JSON，会合并到实际请求体
VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS=
```

也支持按厂商配置只读默认预设：

```bash
VITE_DEFAULT_GEMINI_API_KEY=
VITE_DEFAULT_GEMINI_MODEL=
VITE_DEFAULT_OPENAI_API_KEY=
VITE_DEFAULT_OPENAI_MODEL=
VITE_DEFAULT_ANTHROPIC_API_KEY=
VITE_DEFAULT_ANTHROPIC_MODEL=
VITE_DEFAULT_ONEAPI_API_KEY=
VITE_DEFAULT_ONEAPI_MODEL=
VITE_DEFAULT_DEEPSEEK_API_KEY=
VITE_DEFAULT_DEEPSEEK_MODEL=deepseek-v4-pro
VITE_DEFAULT_DEEPSEEK_BASE_URL=https://api.deepseek.com
VITE_DEFAULT_DEEPSEEK_REQUEST_OPTIONS={"max_tokens":8192}
VITE_DEFAULT_GLM_API_KEY=
VITE_DEFAULT_GLM_MODEL=glm-4.7
```

高级请求参数适合维护厂商扩展字段，例如 Gemini 的 `generationConfig.thinkingConfig`、Claude 的 `thinking`、OpenAI 兼容接口的 `reasoning` / `max_tokens` / `response_format`。这些字段不包含密钥，可以在设置抽屉中展示和编辑；真实 Key 仍不会展示。

DeepSeek / GLM 这类 OpenAI 兼容接口如果要开启思考模式，可以在高级参数里写入类似 `{"thinking":{"type":"enabled"},"max_tokens":8192}`；平台会把这些字段合并到实际请求体。

兼容旧配置 `VITE_GEMINI_API_KEY`，但后续建议统一使用 `VITE_PLATFORM_DEFAULT_*`。

## 数据与持久化

- 本项目无后端服务，文件解析、模型调用、结果导出和历史记录都在浏览器端完成。
- 运行草稿、Prompt 资产库、Prompt 优化历史、页面选择、模型预设选择等数据主要保存在 `localStorage` 和 `IndexedDB`。
- `public/conversion.xlsx` 和 `public/synonyms.xlsx` 是初始化配置文件，不能删除。它们用于同义词、单位换算和相似度计算的基础配置。
- 不要提交真实 API Key、真实报告 PDF、导出结果或含敏感信息的测试文件。

## 代码结构

- `src/App.jsx`：顶层导航、全局设置和线上验证状态。
- `src/components/`：页面与业务组件。
- `src/components/promptIteration/`：Prompt 快速迭代子组件。
- `src/components/promptOptimization/`：Prompt 自动优化子组件。
- `src/components/promptAssets/`：Prompt 资产库组件。
- `src/components/modelPresets/`：模型预设管理与页面快捷选择。
- `src/services/`：PDF 解析、LLM 调用、Excel 导出、持久化、Prompt 优化运行服务。
- `src/utils/`：纯计算、状态规整和视图模型逻辑。
- `src/constants/`：模型、导航、测试集默认值等常量。
- `src/content/`：说明文档内容。
- `tests/`：Node 原生测试。

## 开发约定

- 新增用户可见文案统一使用中文。
- 页面组件只负责编排和交互，复杂业务流程优先放到 `services/`，纯计算逻辑放到 `utils/`。
- 涉及测试集、Prompt 优化、模型预设、导出结构的改动，提交前至少运行 `npm test` 和 `npm run build`。
- 涉及 UI 的改动需要手工验证主要页面是否可打开、上传链路是否可操作、历史状态是否可恢复。
