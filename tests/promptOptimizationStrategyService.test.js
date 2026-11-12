import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROMPT_OPTIMIZATION_STRATEGY,
  normalizePromptOptimizationStrategy,
  renderPromptOptimizationTemplate
} from '../src/services/promptOptimizationStrategyService.js';

test('normalizePromptOptimizationStrategy 会补齐默认模板与参数', () => {
  const strategy = normalizePromptOptimizationStrategy({
    trainingLimit: 3,
    diagnosisUserTemplate: '诊断：{{indicatorCode}}'
  });

  assert.equal(strategy.trainingLimit, 3);
  assert.equal(strategy.diagnosisUserTemplate, '诊断：{{indicatorCode}}');
  assert.equal(typeof strategy.candidateUserTemplate, 'string');
  assert.equal(strategy.candidateUserTemplate.length > 0, true);
  assert.equal(strategy.validationLimit, DEFAULT_PROMPT_OPTIMIZATION_STRATEGY.validationLimit);
});

test('renderPromptOptimizationTemplate 会替换上下文字段并保留未知占位符为空串', () => {
  const text = renderPromptOptimizationTemplate(
    '指标：{{indicatorCode}}\n名称：{{indicatorName}}\n缺省：{{missing}}',
    {
      indicatorCode: 'E1',
      indicatorName: '排放总量'
    }
  );

  assert.equal(text.includes('指标：E1'), true);
  assert.equal(text.includes('名称：排放总量'), true);
  assert.equal(text.includes('缺省：'), true);
});
