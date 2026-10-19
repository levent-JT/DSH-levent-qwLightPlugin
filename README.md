# dsh-qw-light

DSH 的**轻量 QQ / 微信聊天面板**：侧栏底部多两个图标，点开就是聊天窗口。

- 灰色 = 没登录，彩色 = 已登录，右上角数字 = 未读条数
- 点图标弹出居中面板：会话列表 + 头像 + 消息流 + 输入框 + 表情选择
- 支持图片（QQ 直接显示、微信按需下载解密）
- 默认只保留 **1 天**聊天记录，可调（1 小时 ~ 7 天）
- 空闲时不做轮询：QQ 一条 WS 长连接、微信一条官方长轮询、浏览器一条 SSE

> 本项目由 DSH 内置的编码 agent（DeepSeek Harness，`deepseek-v4.1-flash`）在用户机器上
> 按需求逐步实现、自测并撰写文档。实现过程中的协议依据全部来自公开文档与真实接口，
> 没有从本项目自己的代码反推外部语义。

---

## 功能边界（先看这个，避免期待落空）

| | QQ | 微信 |
|---|---|---|
| 登录方式 | NapCat WebUI 扫码（**不在本插件里**） | **本插件内扫码**（腾讯官方 iLink 通道） |
| 私聊 | ✅ | ✅ |
| 群聊 | ✅ | ❌ 协议未保证支持 |
| 发文字 | ✅ | ✅ |
| 发 QQ 表情 | ✅ | ❌ 协议无表情段 |
| 收图片 | ✅ | ✅（按需下载 + AES 解密） |
| 收语音 | 显示占位 | 显示官方转写文本 |
| 昵称/头像 | ✅ 好友表 / 群表 | ❌ 协议不提供昵称，显示 ID 尾号 |

**QQ 走 NapCat 是非官方协议端，有封号风险（建议小号）。** 微信那条是腾讯官方的
`@tencent-weixin/openclaw-weixin` 渠道协议。

---

## 安装

### 1. 装到 profile

桌面版的 profile 是 `desktop`：

```powershell
npx @deepseek-ai/dsh plugin --profile desktop add link:C:\path\to\dsh-qw-light
```

或者：**设置 → 插件 → 添加插件**，填本目录的绝对路径。

装完重启 DSH。

### 2. 配 QQ（NapCat）

1. 装 [NapCat](https://github.com/NapNeko/NapCatQQ)，扫码登录你的 QQ
2. NapCat 里新建一个 **WebSocket 服务器**（正向 WS），默认 `ws://127.0.0.1:3001`
3. 端口不是 3001 的话，改 `~/.dsh/qw-light/config.json`：

```json
{ "qq": { "enabled": true, "wsUrl": "ws://127.0.0.1:3001", "token": "" } }
```

4. 想让**你自己手机发的消息也出现在面板里**，必须在 NapCat 的 WS 配置里打开
   `reportSelfMessage`。不打开的话，聊天框只有对方说的话，没有你自己发的。

连上之后图标变蓝。

### 3. 配微信

点微信图标 → **扫码登录** → 手机微信扫码。token 会存到
`~/.dsh/qw-light/config.json`，下次启动自动恢复。

---

## 配置

`~/.dsh/qw-light/config.json`（也可在面板右上角改保留期）：

```json
{
  "qq": { "enabled": true, "wsUrl": "ws://127.0.0.1:3001", "token": "" },
  "wx": { "enabled": true, "token": "", "base": "https://ilinkai.weixin.qq.com" },
  "retentionHours": 24,
  "persist": true
}
```

| 字段 | 说明 |
|---|---|
| `retentionHours` | 聊天记录保留小时数，夹在 **1 ~ 168**（7 天）之间 |
| `persist` | `false` 则完全不落盘，纯内存，重启即空 |
| `qq.token` | NapCat 的 access token（没开鉴权就留空） |

---

## 轻量是怎么做到的

用户对性能有明确要求，所以这些是设计约束，不是优化项：

**闲时零轮询**
- QQ：一条 WS 长连接，被动收事件；心跳由 NapCat 发
- 微信：官方长轮询，服务端 hold 35 秒 → 每 35 秒 1 次请求
- 浏览器：一条 SSE 常连，消息和未读数都从它推。**没有 1 秒轮询**
- 两条通道都没登录时：不建连接、不起定时器

**内存有硬上限**
- 每会话 ring buffer 300 条
- 会话总数 100 个（超了丢最久没活动的）
- 未读只存一个整数
- 微信解密图片只缓存 24 张

**磁盘按天切、过期整文件删**
```
~/.dsh/qw-light/store/<YYYY-MM-DD>/messages.ndjson
```
- 写入攒批：30 秒或 50 条才碰一次磁盘
- 过期删整个文件，O(1)，不扫大文件
- 总量封顶 50 MB，超了从最旧删起
- 启动时最多回读 8000 行，防止一天特别吵的群把启动拖住

**渲染不刷屏**
- 时间戳是静态字符串，没有秒级 tick
- 表情面板打开才渲染，图片 `loading="lazy"`
- 头像直接走 CDN，靠浏览器缓存

**卸载清干净**：WS、长轮询、SSE、三个定时器全部在 dispose 里停掉，
热重载不会累积连接。

---

## 架构

```
宿主（lib/index.js，inject: ['webServer']）
├─ qq   ── ws://127.0.0.1:3001  (OneBot 11，事件与动作同一条连接)
├─ wx   ── https://ilinkai.weixin.qq.com (扫码 / getupdates 长轮询 / sendmessage)
├─ convs  Map<key, {name, avatar, messages[300], unread, ...}>
└─ 路由   /events(SSE) /snapshot /messages /read /send
          /qq/reconnect /wx/login /wx/logout /settings /media

客户端（lib/client.js）
├─ sidebar.footer.action  两个图标 + 未读徽标
└─ shell.overlay          居中弹窗（portal 到 body）
```

会话 key：`qq:g:<群号>` / `qq:u:<QQ号>` / `wx:u:<用户ID>`。

---

## 开发

```powershell
node scripts/build-host.mjs     # src/host/main.js + vendor/qr.mjs → lib/index.js
node scripts/build-client.mjs   # src/client/*.js → lib/client.js
node test/smoke.mjs             # 27 条断言：路由、SSE、保留期夹取、界面渲染
```

`lib/` 是生成产物，别手改。客户端的 `src/client/*.js` 按
`icons → store → ui → main` 顺序拼进同一个作用域，**后面的能用前面的声明，反过来不行**。

---

## 已知限制

- 微信消息没有昵称字段，只能显示 ID 尾号
- 微信语音只显示官方转写文本，不播放
- QQ 登录二维码在 NapCat 那边，本插件只负责显示连接状态
- `get_*_msg_history` 分页**刻意没做**：默认不拉历史，只看本地缓存。
  这样后台零开销；要看更早的自己去 NapCat 那边翻
- 表情输入用 `[face:14]` 形式的标记，输入框里是纯文本（没有做成富文本 chips）

## License

MIT。见 [LICENSE](./LICENSE) 与 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
