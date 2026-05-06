# Claude 交接文档（2026-05-04）

## 当前目标

本项目正在从 ESG 垂直工具演进为通用 `LLM Lab` 实验平台。当前工作区还没有提交，这份文档用于把最近一轮改动和继续工作的上下文完整交给 Claude。

## 当前工作区状态

- 当前分支有大量未提交修改，不要先 `reset` 或回滚。
- 这些修改是同一阶段连续迭代的一部分，重点集中在：
  - Prompt 快速迭代页重构
  - Prompt 资产库联动
  - Prompt 自动优化流程
  - 模型预设系统
  - 数据预处理工作台局部 UI 调整
- `git status --short` 里目前新增/修改文件较多，属于正常状态。

## 本轮重点改动

### 1. 模型配置系统补了 DeepSeek

目标是把模型接入从“少量固定字段”改成“基础连接 + 高级请求参数 JSON”。

已完成：

- 在 [src/constants/modelPresets.js](/Users/michael_drj/AiProjects/report-parser/src/constants/modelPresets.js) 新增 `VENDOR_KEYS.DEEPSEEK`
- 新增默认只读预设 `preset_deepseek_default`
- DeepSeek 默认 Base URL 改为官方普通 API 形式：
  - `https://api.deepseek.com`
- 默认模型名使用：
  - `deepseek-v4-pro`

### 2. 模型预设支持高级请求参数

核心思想：

- 不在 UI 里为每家厂商硬编码一堆字段
- 统一增加 `requestOptions`，作为 JSON 对象保存
- 运行时按不同 provider 合并进真实请求体

已完成：

- [src/components/modelPresets/ModelPresetManager.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/modelPresets/ModelPresetManager.jsx)
  - 新增 `DeepSeek` 厂商选项
  - 新增“高级请求参数 JSON”输入框
  - 支持厂商默认 Base URL / 默认模型名自动带入
- [src/services/modelPresetResolver.js](/Users/michael_drj/AiProjects/report-parser/src/services/modelPresetResolver.js)
  - `resolveRuntimeLlmConfig()` 会把 `requestOptions` 带到运行时配置
- [src/utils/modelPresetPresentation.js](/Users/michael_drj/AiProjects/report-parser/src/utils/modelPresetPresentation.js)
  - 模型摘要会显示“高级参数”，但不会暴露真实 Key

### 3. `.env` 和说明文档已补充

已完成：

- [README.md](/Users/michael_drj/AiProjects/report-parser/README.md)
- [.env.example](/Users/michael_drj/AiProjects/report-parser/.env.example)

已增加：

- `VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS`
- `VITE_DEFAULT_GEMINI_REQUEST_OPTIONS`
- `VITE_DEFAULT_ANTHROPIC_REQUEST_OPTIONS`
- `VITE_DEFAULT_OPENAI_REQUEST_OPTIONS`
- `VITE_DEFAULT_ONEAPI_REQUEST_OPTIONS`
- `VITE_DEFAULT_DEEPSEEK_REQUEST_OPTIONS`
- `VITE_DEFAULT_GLM_REQUEST_OPTIONS`

另外补了示例说明：

- Gemini 可通过 `generationConfig.thinkingConfig`
- Claude / DeepSeek / GLM 可通过 `thinking`
- OpenAI 兼容接口可通过 `reasoning` / `max_tokens` / `response_format`

### 4. LLM 调用链已支持透传高级参数

已完成：

- [src/services/llmClient.js](/Users/michael_drj/AiProjects/report-parser/src/services/llmClient.js)
  - Gemini 请求体支持合并 `generationConfig` 和额外字段
  - OpenAI-compatible 请求体支持合并 `requestOptions`
  - 支持 `extra_body`
  - Anthropic `messages.create()` 也支持合并扩展字段
- 以下服务已向下传递 `requestOptions`
  - [src/services/extractionService.js](/Users/michael_drj/AiProjects/report-parser/src/services/extractionService.js)
  - [src/services/promptIterationService.js](/Users/michael_drj/AiProjects/report-parser/src/services/promptIterationService.js)
  - [src/services/pdfSplitterService.js](/Users/michael_drj/AiProjects/report-parser/src/services/pdfSplitterService.js)
  - [src/services/promptOptimizationRuntimeService.js](/Users/michael_drj/AiProjects/report-parser/src/services/promptOptimizationRuntimeService.js)
  - [src/services/testBenchService.js](/Users/michael_drj/AiProjects/report-parser/src/services/testBenchService.js)

### 5. 数据预处理工作台顶部位置修正

用户最后指出的是：

- “数据预处理工作台”右侧 `平台默认模型` 的位置不对
- 目标是把它抬到和左侧 `Chunking测试 / PDF压缩 / Token统计` 同一行附近

最新修改在：

- [src/styles/global.css](/Users/michael_drj/AiProjects/report-parser/src/styles/global.css)

当前做法：

- 把 `.dataprep-subpage-toolbar` 的 `margin` 改成了：
  - `margin: -96px 0 14px auto;`

这是最新一次改动。用户贴图表示希望它出现在更靠上的红框位置，因此这里以“上提到子标签同一带”为准。

## 官方接口核对结论

本轮已经按“以官方文档为准”做过一轮校验，结论如下：

- DeepSeek：
  - 普通 API 基础地址用 `https://api.deepseek.com`
  - 普通 API 模型名使用 `deepseek-v4-pro` / `deepseek-v4-flash`
  - 不要把一些 Agent 场景里的 `[1m]` 名称直接当成普通 API model name
- OpenAI：
  - 新项目官方推荐 `Responses API`
  - 但本项目当前的 OpenAI-compatible 统一层还基于 `chat/completions`
  - 由于 DeepSeek / OneAPI / GLM 也要共用，所以当前没有把这一层整体迁到 Responses API
- Anthropic：
  - `thinking` / `budget_tokens` 这类参数不应该在页面写死成独立字段
  - 用 JSON 透传更稳
- Gemini：
  - `thinkingConfig` 属于 `generationConfig` 下的厂商扩展项
  - 也适合通过 JSON 透传
- GLM：
  - 当前依然按 OpenAI-compatible 方式维护
  - 文档示例里默认模型名已顺手更新为 `glm-4.7`

## 已补测试

新增或更新的测试覆盖了以下内容：

- DeepSeek 平台默认预设生成
- DeepSeek runtime config 生成
- `requestOptions` 持久化与透传
- OpenAI-compatible 请求体合并逻辑
- 模型摘要显示“高级参数”

相关测试文件：

- [tests/llmClient.test.js](/Users/michael_drj/AiProjects/report-parser/tests/llmClient.test.js)
- [tests/platformDefaultModel.test.js](/Users/michael_drj/AiProjects/report-parser/tests/platformDefaultModel.test.js)
- [tests/modelPresetResolver.test.js](/Users/michael_drj/AiProjects/report-parser/tests/modelPresetResolver.test.js)
- [tests/modelPresetPresentation.test.js](/Users/michael_drj/AiProjects/report-parser/tests/modelPresetPresentation.test.js)

## 已验证

本轮最后一次已执行通过：

```bash
npm test
npm run build
```

其中：

- `npm test`：`157/157` 通过
- `npm run build`：通过

## Claude 接手后建议先做的事

### 优先级 1：确认顶部位置是否完全符合用户截图预期

用户最后的反馈非常具体：

- 之前把右侧入口往下调了
- 实际要的是“出现在更上方的红框位置”

建议 Claude 本地打开页面肉眼确认：

- `数据预处理工作台`
- `Token统计`
- 右侧 `平台默认模型`

如果仍差一点，只继续微调 `.dataprep-subpage-toolbar`，不要动别的布局。

### 优先级 2：继续做整个平台 UI 一致性走查

目前只处理了模型预设相关一致性和一个顶部定位问题，还没做完全面统一。

后续值得继续看的点：

- `PagePresetQuickSwitch` 在不同页面的垂直对齐是否完全一致
- 数据预处理三个子页顶部是否统一
- Prompt 快速迭代 / Prompt 自动优化 / 线上验证 的模型入口视觉层级是否统一
- 过多的局部 `margin-top: -xxpx` 是否需要后续收敛成更稳定的布局结构

### 优先级 3：如果继续扩模型支持，不建议再堆表单字段

建议保持当前方向：

- 连接信息：固定表单
- 厂商高级能力：`requestOptions` JSON

原因：

- 能覆盖 DeepSeek / Claude / Gemini / GLM / OpenAI-compatible 的差异
- 不需要每次更新厂商文档都改一轮 UI 表单
- 更适合这个实验平台

## 注意事项

- `public/conversion.xlsx` 和 `public/synonyms.xlsx` 不能删
- 现在工作区是脏的，不要为了“整理”先回滚
- 如果 Claude 要提交，先确认这批未提交内容是不是要整体提交，而不是只截当前这几处

