# 最小示例与数据格式

先按[项目 README](../README.md#快速开始)启动前后端。以下样例完全虚构，不需要真实报告或模型 Key。

## 无需 API Key：体验结果验收

直接使用仓库内置的 [demo-model-results.csv](examples/demo-model-results.csv) 与 [demo-ground-truth.csv](examples/demo-ground-truth.csv)。两个文件位于 `docs/examples/`，已使用带 BOM 的 UTF-8 编码。

内容如下；自行复制保存时请选择 **UTF-8 with BOM（带 BOM）**，或用 Excel 工作簿保存相同字段。当前解析器读取不带 BOM 的中文 CSV 可能出现乱码。文件名可自定，表头保留原样。

**`demo-model-results.csv`：模拟模型返回了员工总数，但漏掉用水量。**

```csv
report_name,indicator_code,indicator_name,value_type,year,text_value,num_value,unit,pdf_numbers
演示报告,EMP_TOTAL,员工总数,数值型,2025,,1200,人,12
```

**`demo-ground-truth.csv`：人工核对过的两个指标。**

```csv
report_name,indicator_code,indicator_name,value_type_1,data_year,text_value,num_value,unit,pdf_numbers
演示报告,EMP_TOTAL,员工总数,数值型,2025,,1200,人,12
演示报告,WATER_TOTAL,总用水量,数值型,2025,,800,立方米,18
```

1. 打开「模型结果验收」，分别上传模拟模型结果与标准答案文件。
2. 使用默认关联字段：`report_name ↔ report_name`、`indicator_code ↔ indicator_code`、`year ↔ data_year`。
3. 点击「开始关联分析」。
4. 检查明细：`EMP_TOTAL` 应为“已匹配”，相似度为 `100`；`WATER_TOTAL` 应为“未匹配”，相似度为 `0`。
5. 导出关联对比工作簿，查看标准答案与模型值。页面还可导出分析数据。

这一步展示的是按字段与规则对照两张表，不会调用模型，也不会向模型上游发送文件。

## 接入模型后：试跑一条 Prompt

按[模型配置说明](deployment.md#接入模型)设置并选择模型。将以下虚构内容保存为 `demo-report.txt`：

```text
演示报告
2025 年，公司员工总数为 1200 人，总用水量为 800 立方米。
```

进入「Prompt快速迭代」，点击「新增 Prompt」，填写指标代码 `EMP_TOTAL`、名称“员工总数”、类型“数值型”，点击「应用」，再上传该文件。将系统提示词改为：

```text
你负责从提供的报告文本中提取指标，只输出合法 JSON。
逐项提取已明确披露的数据，不做推断。
```

用户提示词可以填写：

```text
提取 2025 年员工总数。
返回包含 results 数组的 JSON 对象，每项包含：
report_name、indicator_code、indicator_name、value_type、year、num_value、unit。
report_name 使用“演示报告”；indicator_code 使用 EMP_TOTAL，
indicator_name 使用“员工总数”；value_type 使用“数值型”。
缺失的值返回“未披露”。
```

运行后查看原始回复、JSON 解析状态和结果表。员工总数的预期值为 `1200 人`，实际输出需要人工检查。该样例是纯文本，没有 PDF 页码，不能直接用于验证页码准确性。确认后点击「写入新版本」保存到资产库，换一份文本继续试跑。

要试跑用水量，另建代码为 `WATER_TOTAL`、名称为“总用水量”的数值型指标，改写对应用户提示词。多指标合批时，系统提示词共享，用户提示词按指标分别维护。

## 接入自己的数据

### 指标需求表：告诉模型要提取什么

「线上验证工作台」接收 PDF 与 `.xlsx`、`.xls` 或 `.csv` 需求表。中文 CSV 建议使用带 BOM 的 UTF-8 编码；当前解析器读取表格的第一个工作表。一行描述一个指标，建议准备以下字段：

| 字段 | 含义与填写方式 |
| --- | --- |
| `indicator_code` | 稳定的指标代码，如 `EMP_TOTAL` |
| `indicator_name` | 可读的指标名称，如“员工总数” |
| `value_type` | `文字型`、`数值型`、`货币型` 或 `强度型`，并与页面勾选类型一致 |
| `definition` | 指标定义、统计口径 |
| `guidance` | 查找与摘录指导，如目标年份、统计范围 |
| `prompt` | 该指标的具体提取指令，建议明确填写 |

可选的 `system_prompt`、`output_contract` 用于携带系统提示词与输出约束。也可以在页面选择 Prompt 资产作为需求来源。

仓库中的 [ESG 指标需求表示例](../requirement/ESG报告数据指标抽取需求mini.xlsx) 用于参考需求结构，**不是人工标准答案测试集**。跨业务使用时，应改写指标定义和提示词，并检查默认 ESG 模板是否适用。

### 验收表：告诉系统什么算正确

「模型结果验收」需要模型结果表和人工标准答案表，均可使用 Excel/CSV。默认关联字段如下：

| 关联依据 | 模型结果表 | 人工标准答案表 |
| --- | --- | --- |
| 报告标识 | `report_name` | `report_name` |
| 指标代码 | `indicator_code` | `indicator_code` |
| 数据年份 | `year` | `data_year` |

结果值字段包括 `text_value`、`num_value`、`unit`、`currency`、`numerator_unit`、`denominator_unit` 和 `pdf_numbers`，按指标类型填写。标准答案类型推荐使用 `value_type_1`，兼容 `value_type`；模型结果使用 `value_type`。年份建议使用四位年份，例如 `2025`，页码使用从 1 开始的 PDF 物理页码。

页面的字段映射用于**关联键**，不会自动把任意业务列转换成评分所需的值字段。接入已有表格时，需要先把值字段整理为上述名称。关联值应一致；单纯映射列名不会消除文件扩展名、报告简称或其他值差异。

「线上验证工作台」导出的 `结果` 工作表使用 `source_file` 表示来源文件，而默认验收关联键使用 `report_name`。导入验收时，把模型侧的 `source_file` 映射到人工表的 `report_name`，或先改名；两侧的实际值也需要一致。其他值列使用上述字段名。该导出只包含已找到的结果，失败和未运行情况应结合 `摘要` 工作表与运行日志检查；`摘要` 不是标准答案表。

验收结果中的“幻觉”包括模型输出了标准答案中没有对应关联键的非空结果；这可能是额外提取，也可能是标注不完整或关联口径不一致。应回到原文确认后，再判断是否需要修改 Prompt。
