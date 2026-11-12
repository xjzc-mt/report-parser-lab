import { ExtractorTab } from './ExtractorTab.jsx';

export function OnlineValidationWorkbench(props) {
  return (
    <ExtractorTab
      {...props}
      title="线上验证"
      description="上传 PDF 报告与需求清单，端到端执行指标提取并支持原文高亮溯源。"
    />
  );
}
