# Luca：女性向互动言情 Demo 设计

日期：2026-10-09
分支：`luca`
状态：设计已确认，待实现

## 1. 背景与目标

我们要做一个面向英语女性用户的互动言情平台，参考 Candy.ai 的形态，但面向的需求不同。调研结论：

- 女性用户要的是“一个只看着你、记得你的男人，以及一段故事”，不是外貌定制和露骨内容。
- 核心人群是 18–35 岁、已经在为言情幻想付费的女性：BookTok / romantasy / 暗黑言情读者、Love and Deepspace 玩家、Quinn 用户。
- Popvid 实时视频把产品里最值钱的一刻做出来：**他给你打视频电话**。用户只打字、不露脸，在女性场景里反而是卖点。

**本 Demo 的目标**：做一个可以直接发链接给投资人或合作方、对方不需要任何引导就能独立体验的作品。观感和效果优先，不追求留存数据。

**成功标准**：投资人用手机打开链接后，能一路走完“看到消息 → 聊几句 → 他主动来电 → 实时视频对话 → 挂断后他继续发消息”，过程中看不到报错或技术细节。

## 2. 范围

### 做

- 一个男主，做到尽量精致。
- 完整的聊天应用：文字聊天（DeepSeek）+ 随时可发起、也会由他主动发起的实时视频通话（Popvid）。
- 公开链接，无需注册，不设次数限额。
- 18+ 确认与“他是 AI”的提示。
- 危机表达的检测与转介。

### 不做（第一版）

账号、付费、多角色、多场景、语音输入、后台数据看板、自定义音色、服务端存储聊天记录。

## 3. 角色设定

- **名字**：Luca Vitale，31 岁。
- **身份**：纽约意大利裔黑手党家族的继承人。
- **性格**：对外冷酷、话少、带威胁感；只对“你”克制而温柔；会吃醋、有占有欲，但从不越界，也从不强迫。
- **关系起点**：你是他在一场慈善晚宴上“不该注意到的人”。他已经拿到你的号码，并且先发了消息。
- **开场白**：`You left before I could ask your name. I found it anyway.`
- **说话风格**：短句、低声、口语化英语；偶尔夹一个意大利语词；先问再给，掌控节奏；不用表情符号。
- **尺度**：暧昧、张力、危险感，保持 PG-13。不出现露骨性内容，不描写或美化真实暴力细节。角色内不主动谈论自己是 AI，但用户认真追问“你是真人吗”时，不能声称自己是真人。
- **视频场景（唯一）**：深夜，他在顶层公寓的书房，暖色台灯，窗外是雨中的曼哈顿。他坐着，直视镜头，像在和你视频通话。
- **形象**：AI 生成的原创照片，576×768（3:4 竖版），存为 `public/luca.jpg`。不使用任何真人肖像。
- **音色**：先用 Popvid 默认音色，`voice_ref_url` 留作配置项，日后换授权音色只改环境变量。

## 4. 体验流程（手机竖屏优先）

1. **进入页 `Gate`**：男主大图，文案 `He already has your number.`。底部说明“18+ only · Luca is an AI character”，按钮 `Open his message`。点击即视为确认，并记录在本地，下次不再出现。
2. **聊天页 `Chat`**：
   - iMessage 风格，深色主题。顶部是他的头像和名字，右侧有视频通话按钮。
   - 首次进入时，他的开场白已经在对话里。
   - 底部有 2–3 个快捷回复（随对话推进更换），也可以自由输入。
   - 等待回复时显示“正在输入”动画。
3. **他主动来电 `IncomingCall`**：
   - 当 DeepSeek 返回 `call: true` 时触发。提示词要求他在第 3–5 轮之间，或在用户表达想见他时发起；同一段对话里只主动打一次，被拒接后不再主动打。
   - 如果到第 6 轮还没触发，服务端强制在这一轮返回 `call: true`，保证投资人一定能看到视频。
   - 全屏显示头像、`Luca is calling…`、接听与拒接按钮。拒接后他会发一条文字（`Fine. Text me then.`）。
   - 用户点聊天页顶部的视频按钮，也会直接进入通话（不经过来电页）。
4. **视频通话页 `Call`**：
   - 全屏竖版视频，他的 `turn.text` 先作为字幕显示，视频随后开口。
   - 底部是输入框和动作快捷键：`*smile*`、`*look away*`、`*bite your lip*`，发送时转换成第三人称动作描述，例如 `The user smiles at you.`。
   - 显示通话时长；最后 30 秒显示倒计时。
   - 等待他回复时（`media.clip.kind === "idle"`），画面上有细微的呼吸感暗角，而不是加载转圈。
   - 挂断键。
5. **挂断后**：聊天里插入一条通话记录（`Video call · 3:12`），通话中的每句对话也已写进聊天记录。随后他发来一条接续的文字，延续通话里的话题。

## 5. 架构

在现有仓库基础上改造，沿用 Express 5 + Vite + React 19，部署到 Render（与 WIRE 24、Pitchside 相同的方式）。旧 Demo 专用的文件（`match.js`、`news.js`、`understand.js` 及其测试、`Booth.jsx`、`Studio.jsx`）在本分支移除。

### 服务端 `server/`

| 文件 | 职责 |
| --- | --- |
| `persona.js` | 男主人设的唯一来源。导出 `PERSONA`（名字、开场白、初始快捷回复）和三个函数：`chatSystemPrompt()`、`videoCharacterPrompt()`、`videoScenePrompt()`。两套提示词共用同一段人设与尺度描述 |
| `chat.js` | `generateReply({ messages, event })`：调用 DeepSeek，返回 `{ reply, call, quickReplies }`。负责截取最近 30 条、拼装系统提示词、解析 JSON、兜底 |
| `safety.js` | `detectCrisis(text)`：自伤 / 自杀关键词检测；`CRISIS_REPLY`：跳出角色的转介文案（含 988 热线与 Crisis Text Line）。纯函数、无 Node 依赖，客户端通过 Vite 直接引入同一个文件 |
| `history.js` | `toPopvidHistory(messages)`：把本地消息转换成 Popvid `history`（`user` → `user`，`him` → `character`），过滤掉通话记录条目，只取最近 40 条，每条截断到 2000 字符 |
| `popvid.js` | 从现有 `index.js` 抽出：`createSession({ history, req })`、`closeSession(id)`、并发计数、`no_capacity` 退避重试、首帧失败时不带首帧重试、超时回收 |
| `index.js` | 只放路由与静态资源 |

### 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, realtime, chat, sessions }` |
| GET | `/api/persona` | 前端需要的公开信息：名字、开场白、初始快捷回复 |
| POST | `/api/chat` | 请求 `{ messages, event? }`，`event` 取值 `call_ended` / `call_declined` / `call_dropped`，可附带 `duration_ms`。返回 `{ reply, call, quickReplies }` |
| POST | `/api/call` | 请求 `{ messages }`。成功返回 `{ credentials, session: { session_id, reservation_expires_at_ms } }`；繁忙返回 `429 { error: { code: "busy", retry_after_ms } }` |
| POST | `/api/calls/:id/heartbeat` | 续租，超过 25 秒无心跳由服务端回收 |
| DELETE | `/api/calls/:id` | 挂断兜底，调用 Popvid `DELETE /sessions/{id}` |

### 客户端 `src/`

| 文件 | 职责 |
| --- | --- |
| `lib/r2.js` | 原样复用现有的 Popvid WebRTC / WebSocket 客户端 |
| `lib/api.js` | 封装上述路由 |
| `lib/store.js` | 本地存储（`localStorage` 键 `luca.v1`）：`{ gatePassed, calledOnce, declined, messages }`；消息格式 `{ id, role: "user" \| "him", text, kind: "text" \| "call", ts, durationMs? }` |
| `components/Gate.jsx` | 进入页 |
| `components/Chat.jsx` | 聊天页 |
| `components/IncomingCall.jsx` | 来电页 |
| `components/Call.jsx` | 视频通话页 |
| `App.jsx` | 根据状态在四个页面之间切换 |

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `POPVID_API_KEY` | 仅服务端 |
| `POPVID_BASE_URL` | 默认 `https://popvid.ai/api/public/v1` |
| `DEEPSEEK_API_KEY` | 仅服务端 |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |
| `PUBLIC_BASE_URL` | 可选，Popvid 拉取 `/luca.jpg` 的公网地址 |
| `VOICE_REF_URL` | 可选，授权音色样本 |
| `MAX_CONCURRENT_SESSIONS` | 同时视频通话上限，默认 3 |

## 6. 数据流

1. **发消息**：客户端把新消息写入本地，调用 `/api/chat`。服务端先做危机检测，命中则直接返回 `CRISIS_REPLY`、`call: false`；否则调用 DeepSeek。客户端收到后写入他的回复；若 `call: true` 且尚未主动打过，就进入来电页。
2. **接听**：客户端调用 `/api/call`，服务端用 `toPopvidHistory` 转换聊天记录，连同人设、场景、首帧、音色创建 Popvid 会话，只把 `credentials` 返回给浏览器。客户端用 `R2Client` 建立连接。
3. **通话中**：用户输入先做危机检测（客户端调用同一套关键词，命中则不发给 Popvid，直接挂断并在聊天里显示转介文案）。正常输入用 `turn.submit` 发送。`turn.text` 显示为字幕，同时写入本地聊天记录。每 10 秒发一次心跳。
4. **临近上限**：从 `usage.tick` / `session.renewed` 推算出剩余时长不足 30 秒时显示倒计时，并在剩余 20 秒时自动提交一条 `The user has to go in a moment.`，让他道别。
5. **挂断**：客户端发送 `session.close`，并调用 `DELETE /api/calls/:id` 兜底。本地插入通话记录，再以 `event: "call_ended"` 调用 `/api/chat`，取得他接续的文字。

## 7. 异常处理

原则：投资人看到的永远是剧情，而不是报错。

| 情况 | 处理 |
| --- | --- |
| DeepSeek 超时（8 秒）或报错 | 服务端重试一次；仍失败时返回人设内的短句 `Give me a second.`，并标记 `retryable`，前端在这条下方显示低调的“重新发送” |
| DeepSeek 返回非法 JSON | 把原始文本当作 `reply`，`call: false` |
| 同时通话已满，或 Popvid `no_capacity` | 来电页文案切换为 `Luca is on another line…`，客户端按 `retry_after_ms` 自动重试，累计约 30 秒；放弃后回到聊天，插入他的文字 `I'll call you back.` |
| 首帧拉取失败 | 不带首帧重试一次 |
| 某一轮 `content_rejected` | 丢弃这一轮，字幕显示 `Careful.`，通话继续 |
| 网络抖动 | `R2Client` 自动重连与续传 |
| 会话意外结束（`media_failed`、`idle_timeout`、`viewer_gone` 等） | 回到聊天，插入通话记录，以 `event: "call_dropped"` 获取他的一条文字 |
| 自动播放被拦截 | 接听按钮的点击用于解锁音频与视频播放 |
| 自伤 / 危机表达 | 跳出角色，提供 988 与 Crisis Text Line；该轮不进入 DeepSeek 或 Popvid |

## 8. 合规

- 进入页明确提示 18+ 与 AI 角色身份（纽约 GBL Article 47、加州 SB 243）。
- 通话页角落常驻一个小标记 `AI`。
- 网站页脚放一个简短的自伤处理说明页链接（SB 243 要求公开协议）。
- 不使用真人肖像或声音。

## 9. 测试

- **单元测试**（`node --test`）：
  - `persona.js`：两套提示词都包含尺度边界与“被追问时不声称自己是真人”的约束；长度不超过 Popvid 的 4000 字符上限。
  - `history.js`：角色映射正确；过滤通话记录条目；超过 40 条时只保留最近 40 条；超长内容截断。
  - `chat.js`：合法 JSON 解析；非法 JSON 兜底；第 6 轮强制 `call: true`；已主动打过电话后不再返回 `call: true`（DeepSeek 调用用注入的 fetch 模拟）。
  - `safety.js`：常见危机表达命中，普通暗黑言情台词（如 “I'd kill for you”）不误伤。
- **端到端**：部署到 Render 后，用 iPhone Safari 与安卓 Chrome 各走一遍完整路径，并人为验证“繁忙排队”和“断网重连”两条异常路径。

## 10. 风险与待确认

- **成本**：链接公开且不限额，被大范围转发会持续消耗 Popvid 余额。Popvid 定价页当前无法访问，单位成本待向 Popvid 确认。
- **内容审核尺度**：暗黑言情的台词边界需要实测，可能需要根据 `content_rejected` 的情况调整人设措辞。
- **并发**：投资人集中打开时可能排队，需要提前和 Popvid 确认可用并发。
