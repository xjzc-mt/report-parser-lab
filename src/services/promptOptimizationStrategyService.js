function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeNumber(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_PROMPT_OPTIMIZATION_STRATEGY = {
  diagnosisSystemPrompt: '你是一名擅长 PDF 指标提取任务的 Prompt 诊断专家。请只输出合法 JSON，不要输出额外说明。',
  diagnosisUserTemplate: `你正在分析一个 PDF 指标提取任务的基线用户提示词失败原因。

指标编码：{{indicatorCode}}
指标名称：{{indicatorName}}

固定前提：
- 抽取系统提示词已经固定负责 JSON 输出、页码规则、未披露规则和通用抽取约束
- 本次优化对象仅限用户提示词，不改系统提示词

当前基线用户提示词：
{{baselinePrompt}}

样本范围：
{{reportExamples}}

请输出 JSON：
{
  "summary": "一句话总结主要问题",
  "root_causes": ["根因1", "根因2"],
  "pattern_analysis": "跨报告共性和差异",
  "prompt_risks": ["当前 Prompt 的关键风险"]
}`,
  candidateSystemPrompt: '你是一名擅长信息抽取任务的 Prompt 设计专家。请基于诊断结果改写 Prompt，并只输出合法 JSON。',
  candidateUserTemplate: `请基于以下诊断结果生成一个更稳健的用户提示词。

指标编码：{{indicatorCode}}
指标名称：{{indicatorName}}

固定前提：
- 抽取系统提示词已经固定负责 JSON 输出、页码规则、未披露规则和通用抽取约束
- 你只能改写用户提示词，不要改写或重复系统提示词职责

当前基线用户提示词：
{{baselinePrompt}}

诊断结果：
{{diagnosisSummary}}

训练样本摘要：
{{reportExamples}}

要求：
1. 必须保持跨报告泛化，不允许针对单份 PDF 写死规则
2. 未披露时必须明确返回未披露，不允许猜测
3. 输出仍由业务 Prompt 决定，不要混入分析语言
4. 不要在用户提示词里重复定义 JSON schema、页码规则和通用系统角色

请输出 JSON：
{
  "improved_prompt": "新的用户提示词",
  "change_summary": "本次改动摘要",
  "guardrails": ["新增约束1", "新增约束2"]
}`,
  validationSystemPrompt: '你是一名 Prompt 优化评审专家。你只负责解释候选 Prompt 是否值得接受，并只输出合法 JSON。',
  validationUserTemplate: `请根据验证结果评审这次 Prompt 优化。

指标编码：{{indicatorCode}}
指标名称：{{indicatorName}}

固定前提：
- 系统提示词未变，本次只替换了用户提示词

基线用户提示词：
{{baselinePrompt}}

候选用户提示词：
{{candidatePrompt}}

验证结果：
{{validationSummary}}

请输出 JSON：
{
  "decision": "accept 或 reject",
  "summary": "为什么接受或拒绝",
  "risks": ["仍然存在的风险1", "仍然存在的风险2"]
}`,
  trainingLimit: 5,
  validationLimit: 3,
  windowRadius: 1
};

export function normalizePromptOptimizationStrategy(raw = {}) {
  const next = raw && typeof raw === 'object' ? raw : {};

  return {
    diagnosisSystemPrompt: normalizeString(next.diagnosisSystemPrompt) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.diagnosisSystemPrompt,
    diagnosisUserTemplate: normalizeString(next.diagnosisUserTemplate) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.diagnosisUserTemplate,
    candidateSystemPrompt: normalizeString(next.candidateSystemPrompt) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.candidateSystemPrompt,
    candidateUserTemplate: normalizeString(next.candidateUserTemplate) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.candidateUserTemplate,
    validationSystemPrompt: normalizeString(next.validationSystemPrompt) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.validationSystemPrompt,
    validationUserTemplate: normalizeString(next.validationUserTemplate) || DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.validationUserTemplate,
    trainingLimit: normalizeNumber(next.trainingLimit, DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.trainingLimit),
    validationLimit: normalizeNumber(next.validationLimit, DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.validationLimit),
    windowRadius: normalizeNumber(next.windowRadius, DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.windowRadius)
  };
}

export function renderPromptOptimizationTemplate(template, context = {}) {
  const source = normalizeString(template);
  if (!source) {
    return '';
  }

  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => normalizeString(context[key]));
}
