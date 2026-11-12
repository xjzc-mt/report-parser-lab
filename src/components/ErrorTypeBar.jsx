import { Tooltip } from '@mantine/core';

/**
 * 错误类型水平堆叠条形图
 *
 * Props:
 *   breakdown  { perfect, pass, partial, miss, hallucination, tn }
 *   total      总行数（用于百分比计算）
 *   height     条形高度（默认 20px）
 */

const LEGACY_SEGMENTS = [
  { key: 'perfect', label: '完全匹配', color: '#16a34a', textColor: '#fff' },
  { key: 'pass', label: '达标匹配', color: '#86efac', textColor: '#14532d' },
  { key: 'partial', label: '部分匹配', color: '#fbbf24', textColor: '#78350f' },
  { key: 'miss', label: '漏提取', color: '#f87171', textColor: '#fff' },
  { key: 'hallucination', label: '过摘录', color: '#c084fc', textColor: '#fff' },
];

const MERGED_SEGMENTS = [
  { key: 'perfect_match', label: '完美匹配', color: '#16a34a', textColor: '#fff' },
  { key: 'pass_match', label: '达标匹配', color: '#86efac', textColor: '#14532d' },
  { key: 'duplicate_with_pass', label: '重复摘录-含达标', color: '#60a5fa', textColor: '#1e3a8a' },
  { key: 'duplicate_without_pass', label: '重复摘录-无达标', color: '#fca5a5', textColor: '#7f1d1d' },
  { key: 'single_fail', label: '单条错误', color: '#fbbf24', textColor: '#78350f' },
  { key: 'miss', label: '漏摘录', color: '#f87171', textColor: '#fff' },
  { key: 'hallucination', label: '幻觉', color: '#c084fc', textColor: '#fff' },
];

export function ErrorTypeBar({ breakdown = {}, total, height = 20 }) {
  const useMerged = Object.prototype.hasOwnProperty.call(breakdown, 'perfect_match') ||
    Object.prototype.hasOwnProperty.call(breakdown, 'pass_match') ||
    Object.prototype.hasOwnProperty.call(breakdown, 'single_fail');
  const SEGMENTS = useMerged ? MERGED_SEGMENTS : LEGACY_SEGMENTS;
  const denom = total || Object.values(breakdown).reduce((a, b) => a + (b ?? 0), 0) || 1;

  const segments = SEGMENTS.map((s) => {
    const count = breakdown[s.key] ?? 0;
    const pct = (count / denom) * 100;
    return { ...s, count, pct };
  }).filter((s) => s.pct > 0);

  if (segments.length === 0) {
    return (
      <div
        style={{
          height,
          borderRadius: 6,
          background: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#94a3b8'
        }}
      >
        暂无数据
      </div>
    );
  }

  return (
    <div>
      {/* 堆叠条 */}
      <div
        style={{
          display: 'flex',
          height,
          borderRadius: 6,
          overflow: 'hidden',
          width: '100%'
        }}
      >
        {segments.map((s) => (
          <Tooltip
            key={s.key}
            label={`${s.label}：${s.count} 项（${s.pct.toFixed(1)}%）`}
            withArrow
          >
            <div
              style={{
                width: `${s.pct}%`,
                background: s.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                color: s.textColor,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                cursor: 'default',
                flexShrink: 0,
                padding: '0 2px'
              }}
            >
              {`${Math.round(s.pct)}%`}
            </div>
          </Tooltip>
        ))}
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 6 }}>
        {SEGMENTS.map((s) => {
          const count = breakdown[s.key] ?? 0;
          return (
            <div
              key={s.key}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#475569' }}
            >
              <div
              style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color,
                  flexShrink: 0
                }}
              />
              {s.label} {count} 项
            </div>
          );
        })}
      </div>
    </div>
  );
}
