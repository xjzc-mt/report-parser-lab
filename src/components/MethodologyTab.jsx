import { IconBooks } from '@tabler/icons-react';
import { methodologyContent } from '../content/methodologyContent.js';

function SimpleTable({ headers, rows }) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((header) => <th key={header}>{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>
            {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BulletList({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return (
    <ul>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function PageGuide({ guide }) {
  return (
    <section className="methodology-page-guide">
      <div className="methodology-page-guide-heading">
        <h3>{guide.label}</h3>
        <span>{guide.parent}</span>
      </div>
      <p>{guide.purpose}</p>

      <h4>输入</h4>
      <BulletList items={guide.inputs} />

      <h4>操作步骤</h4>
      <ol>
        {guide.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>

      <h4>输出</h4>
      <p>{guide.outputs}</p>

      <h4>模型限制</h4>
      <BulletList items={guide.modelLimits} />

      <h4>保存与恢复</h4>
      <p>{guide.persistence}</p>
      <p>{guide.recovery}</p>

      <h4>运行中离开页面</h4>
      <p>{guide.exit}</p>

      <h4>常见失败原因</h4>
      <BulletList items={guide.failures} />
    </section>
  );
}

export function MethodologyTab() {
  return (
    <section className="glass-panel methodology-tab">
      <div className="section-heading">
        <h2 className="section-title">
          <IconBooks size={20} stroke={1.8} />
          <span>说明文档</span>
        </h2>
        <p className="section-caption">平台结构、逐页操作、模型边界、保存规则和安全说明。</p>
      </div>

      <div className="methodology-content">
        <h3>1. 平台总览</h3>
        <p>{methodologyContent.overview.intro}</p>
        <BulletList items={methodologyContent.overview.points} />

        <h3>2. 系统架构</h3>
        <SimpleTable headers={['层级', '技术', '说明']} rows={methodologyContent.architecture.rows} />

        <h3>3. 逐页使用说明</h3>
        <p className="section-caption">
          每个页面都说明作用、输入、步骤、输出、模型限制、保存恢复、退出规则和常见失败原因。
        </p>
        {methodologyContent.pageGuides.map((guide) => (
          <PageGuide key={guide.key} guide={guide} />
        ))}

        <h3>4. 模型预设与公司连接</h3>
        <p>{methodologyContent.modelGuide.intro}</p>
        <SimpleTable headers={['类型', '存储位置', '说明']} rows={methodologyContent.modelGuide.rows} />
        <BulletList items={methodologyContent.modelGuide.bullets} />

        <h3>5. 管理员与后台</h3>
        <p>{methodologyContent.adminGuide.intro}</p>
        <ol>
          {methodologyContent.adminGuide.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <BulletList items={methodologyContent.adminGuide.bullets} />

        <h3>6. 数据保存与恢复</h3>
        <SimpleTable headers={['位置', '保存内容', '恢复边界']} rows={methodologyContent.persistence.rows} />
        <p><strong>{methodologyContent.persistence.note}</strong></p>

        <h3>7. 安全边界</h3>
        <BulletList items={methodologyContent.security} />
      </div>
    </section>
  );
}
