export const methodologyContent = {
  architecture: {
    intro: 'LLM Lab 是纯客户端架构，文件解析、配置持久化、模型调用与导出都在浏览器端完成；平台不提供后端存储服务。',
    rows: [
      ['构建工具', 'Vite + React', '组件化界面、模块化业务逻辑与环境变量支持'],
      ['UI 框架', 'Mantine + Tabler Icons', '统一表单、抽屉、按钮和图标体系'],
      ['文件处理', 'pdf.js / pdf-lib / SheetJS', 'PDF 文本解析、PDF 切片压缩、Excel 读写'],
      ['状态持久化', 'localStorage / IndexedDB', '保存页面选择、模型预设、Prompt 资产、历史运行和文件缓存'],
      ['AI 接口', 'Gemini / OpenAI 兼容 / Claude / DeepSeek / GLM / OneAPI', '通过模型预设统一管理不同厂商连接方式与高级请求参数']
    ]
  },
  inputSpec: {
    pdf: [
      'Prompt 快速迭代和线上验证支持上传多份 PDF；Gemini 等支持 PDF 上传的模型会按多模态方式读取文件。',
      'Prompt 自动优化会使用关联对比文件中的报告与页码信息，结合上传的 PDF 生成优化样本。',
      'PDF 压缩和 Token 统计用于提前评估输入大小、Base64 体积和调用成本。'
    ],
    excelRows: [
      ['indicator_code', '字符串', '指标代码，建议保持唯一并支持 leading zero'],
      ['indicator_name', '字符串', '指标名称'],
      ['value_type', '字符串', 'TEXT / NUMERIC / INTENSITY 等指标类型'],
      ['report_name / source_announce_id / announcement_id', '字符串', '报告匹配字段，具体以页面关联配置为准'],
      ['pdf_numbers', '字符串', '指标所在 PDF 页码，可为空或多页'],
      ['prompt', '可选', '测试集或对比文件中的用户提示词快照'],
      ['text_value / num_value / unit', '可选', '测试集标准答案字段，用于验收和相似度计算']
    ]
  },
  outputSpec: {
    rows: [
      ['Prompt 快速迭代', '原始回复 / JSON 解析结果 / 历史记录', '用于观察同一 Prompt 在多份 PDF 上的表现'],
      ['模型结果验收', '基于测试集 / 基于 LLM 的关联对比文件', '用于定位缺失、幻觉和低相似度样本'],
      ['Prompt 自动优化', '每轮候选、验证结果、评审结论和导出工作簿', '用于复盘优化链路并写回 Prompt 资产库'],
      ['线上验证', '结构化摘录结果 Excel', '用于验证真实文件抽取链路'],
      ['数据预处理', '切片结果 / 压缩结果 / Token 估算', '用于控制输入质量和调用成本']
    ],
    note: '导出内容应优先保证可复盘：输入样本、模型原始输出、解析结果、相似度和优化理由都应尽量保留。'
  },
  batching: {
    rows: [
      ['Prompt 快速迭代', 'PDF 文件维度', '用户手动控制', '便于快速比较同一 Prompt 的跨文件稳定性'],
      ['模型结果验收', 'Excel 行维度', '浏览器本地处理', '先完成关联、相似度和异常分类，再决定是否进入优化'],
      ['Prompt 自动优化', '指标维度', '按目标指标批量执行', '每个指标保留独立基线、候选、验证和评审记录'],
      ['线上验证', '指标类型维度', '按 batch size 和并发数执行', '控制上下文长度和模型调用压力']
    ],
    bullets: [
      '测试集工作台是闭环核心：快速迭代生成 Prompt，模型结果验收定位问题，自动优化负责可解释地改写用户提示词。',
      'Prompt 资产库保存可复用用户提示词版本，自动优化和快速迭代都应围绕资产库联动。',
      '模型预设只保存连接与能力描述，页面只选择预设名称，避免每个页面重复配置 API Key。',
      '复杂运行历史要限制展示数量并保留导出能力，防止本地持久化越积越多影响页面流畅度。'
    ]
  },
  apiIntegration: {
    rows: [
      ['Gemini Native', 'gemini_native', 'x-goog-api-key', '支持 PDF 原生多模态输入'],
      ['OpenAI 兼容', 'openai_compatible', 'Authorization: Bearer', '通常使用文本或兼容网关能力'],
      ['Anthropic Native', 'anthropic_native', 'x-api-key', '按 Claude 接口格式调用'],
      ['DeepSeek', 'openai_compatible', 'Authorization: Bearer', '按 OpenAI 兼容接口接入，可透传 max_tokens / reasoning 等扩展字段'],
      ['OneAPI / GLM', 'openai_compatible', 'Authorization: Bearer', '通过统一兼容层接入']
    ]
  },
  security: [
    '平台默认模型优先从 `.env` 的 `VITE_PLATFORM_DEFAULT_*` 读取，页面不展示真实 Key。',
    '自定义模型预设保存在浏览器本地；不要在共享浏览器环境中保存真实生产密钥。',
    '真实报告、导出结果、API Key 和包含敏感信息的样本文件不要提交到 Git。',
    '`public/conversion.xlsx` 和 `public/synonyms.xlsx` 是初始化配置文件，不能删除。'
  ]
};
