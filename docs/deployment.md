# 部署与模型配置

本文介绍 Report Parser Lab 的本地运行、模型接入和单副本部署。首次体验见[项目 README](../README.md#快速开始)。

## 本地开发

使用满足依赖要求的 Node.js 22.13+，在仓库目录运行 `npm install`。后端命令会读取已有的 `.env`；新环境可参考 [.env.example](../.env.example) 创建配置，不要覆盖已有的本机配置。

```bash
# 终端 1
ADMIN_PASSWORD='替换为自己的本地密码' npm run dev:server
```

```bash
# 终端 2
npm run dev
```

前端默认在 `5173`，通过 Vite 把 `/api` 代理到 `http://127.0.0.1:8787`。修改代理目标时使用：

```bash
LLM_LAB_API_PROXY=http://127.0.0.1:8787 npm run dev
```

默认管理员用户名为 `admin`；访问前端的 `/admin` 登录。修改环境变量后需要重启对应的后端或 Vite 进程。

## 单副本部署

先生成管理员密码哈希：

```bash
npm run hash-password -- '替换为自己的管理员密码'
```

将生成的完整哈希配置到服务端环境的 `ADMIN_PASSWORD_HASH`。也可以在受限的 `.env` 中填写；哈希中的 `$` 需要保留原样，不要让 shell 展开。生产配置示意如下，示例中的哈希必须替换：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH='scrypt$替换为实际生成的完整哈希'
COOKIE_SECURE=true
```

在上述环境配置就绪后执行：

```bash
npm run build
npm run server
```

或者执行 `npm start`，先构建再启动。后端默认在 `127.0.0.1:8787` 提供 API 和 `dist/` 静态页面，`/` 为工作台，`/admin` 为后台。`npm run preview` 仅用于预览前端构建，不能替代后端服务。

团队部署应放在同一 HTTPS 域名与反向代理后，设置 `COOKIE_SECURE=true`；本地 HTTP 调试保持 `false`。容器或内网服务需要监听所有网卡时，设置 `HOST=0.0.0.0`，并通过部署入口限制访问。

## 接入模型

### 个人预设

在页面模型选择弹窗中打开「配置模型」，填写接口地址和 Key，点击「Ping 模型」，选择模型并保存。新配置保存后进入预设列表；已保存配置的修改会自动同步。运行页面需要显式选择供应商和模型。

个人 Key 保存在当前浏览器，请求由浏览器直连上游，服务商需要允许相应的浏览器访问。团队共享密钥应配置为托管连接，避免复制到每个人的浏览器。

### 团队托管连接

界面中的“公司托管”即团队共享模型。管理员在 `/admin` 中维护连接名称、传输协议、服务地址、Key、可用模型及能力。

1. 新增连接并填写自己的服务商信息。默认使用 OpenAI 兼容协议和 `https://api.openai.com/v1`；使用其他网关时，修改协议与地址。
2. 点击「Ping 模型」从上游获取模型列表，勾选要开放的模型。
3. 按实际能力配置 JSON、PDF 直传、Vision、Streaming 标签，启用连接。
4. 在工作台选择该托管模型，先用不含敏感内容的小文件验证调用。

支持 Gemini 原生、Anthropic 原生和 OpenAI 兼容协议。公司转发支持 Gemini 原生与 OpenAI 兼容协议的附件请求；OpenAI 兼容协议使用 `file` 内容。Anthropic 原生公司连接当前不支持附件直传。勾选能力标签不代表上游一定支持，仍需实际验证。

线上验证在 PDF 直传不可用或失败时会尝试提取文本；扫描件没有可用文本时，回退可能失败。

### 首次启动的环境初始化

首次启动、尚未执行环境初始化且没有公司连接时，可以用服务端环境变量初始化一条连接。以下为配置示意，Key 与模型名需要换成自己的值：

```dotenv
COMPANY_DEFAULT_API_KEY=替换为自己的服务端密钥
COMPANY_DEFAULT_NAME=团队模型
COMPANY_DEFAULT_VENDOR=gemini
COMPANY_DEFAULT_TRANSPORT=gemini_native
COMPANY_DEFAULT_BASE_URL=https://generativelanguage.googleapis.com/v1beta
COMPANY_DEFAULT_MODEL=
AUTO_SEED_COMPANY=true
```

模型名可留空，随后在后台 Ping 并勾选开放模型。已有连接通过后台维护；密钥使用 `COMPANY_DEFAULT_API_KEY` 或后台录入。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口，默认 `8787` |
| `HOST` | 监听地址，默认 `127.0.0.1` |
| `LLM_LAB_API_PROXY` | Vite 开发代理目标，默认 `http://127.0.0.1:8787` |
| `LLM_LAB_CONFIG_PATH` | 服务端配置文件路径，默认 `server/data/config.json` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | 管理员初始化凭据；生产建议使用哈希 |
| `COOKIE_SECURE` | HTTPS 部署设为 `true` |
| `TRUST_PROXY` | 仅在反向代理正确覆盖 `X-Forwarded-*` 时开启 |
| `ALLOWED_ORIGINS` | 额外允许的完整 Origin，逗号分隔 |
| `UPSTREAM_TIMEOUT_MS` | 公司模型上游超时，默认 `300000` 毫秒 |
| `MAX_PROXY_BODY_BYTES` | 公司转发请求体上限，默认 `52428800` 字节 |
| `PROXY_RATE_LIMIT_PER_MINUTE` | 公司转发每分钟请求上限，默认 `600` |
| `LOG_UPSTREAM_ERRORS` | 是否记录脱敏后的上游错误正文，默认关闭 |

前端只读取白名单内的非敏感 `VITE_PLATFORM_DEFAULT_*` 默认值。不要把 API Key 放入任何 `VITE_*` 变量。

## 持久化与访问边界

- 公司连接、Key、页面开关和默认参数保存在服务端配置文件。文件默认权限为 `0600`（平台支持时）；部署时使用受限的持久化目录，避免容器重建导致配置丢失。
- 管理员会话保存在服务端内存，默认空闲 8 小时过期，重启后需重新登录。多副本的配置与会话共享需要另行设计。
- 个人预设、Prompt 资产、草稿和部分上传缓存保存在浏览器，不自动跨设备同步。清除浏览器数据会影响这些内容；线上验证结果和文件处理产物需要及时下载。
- 普通工作台与公司模型调用没有完整的用户账号、租户隔离或配额体系。管理后台登录不能替代部署入口的用户访问认证，也不能只靠 CORS 或隐藏菜单限制使用范围。
- 公司 Key 只留在服务端；管理查询返回 `keyConfigured`，更新连接时 Key 留空表示保留。前台不获取托管连接的 Base URL、Key 或请求参数。
- `/api/llm/company` 只使用服务端允许的连接、地址和模型，拒绝前端注入 `apiUrl`、`apiKey`、`headers` 等字段。管理写接口要求管理请求头、同源 Origin 和 `HttpOnly`、`SameSite=Strict` 会话 Cookie。
- 默认不记录 Key、完整 Prompt、PDF 内容或上游响应正文；开启 `LOG_UPSTREAM_ERRORS` 时会先替换 Key，但仍应控制日志访问与保留范围。
- `.env`、`server/data/`、真实报告和敏感导出文件不得提交，也不要把公司 Key 复制到个人预设或个人备份。

构建会扫描文本产物中匹配环境变量规则且长度不少于 8 的密钥值，但不会读取服务端配置文件中的全部 Key，不能替代提交检查或完整的泄露审查。

## 验证方式

```bash
npm test
npm run build
git diff --check
```

自动化测试包含模拟上游与服务端 HTTP 集成测试。部署后还需要使用自己的模型服务验证登录、模型发现、实际调用和文件导出；PDF 上传、扫描件处理、多模态能力和反向代理限制均不能用本地测试结果代替。验证记录见[文档索引](README.md)。
