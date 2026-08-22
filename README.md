# dsh-sidechat

Codex 风格的 `/side` 侧边对话插件（DeepSeek Harness Web GUI）。

在运行中的主对话旁边打开一个**临时分叉对话**：继承主线已完成的上下文、不打断主任务、不污染主线程的模型上下文。适合"边跑边问"——在主线任务运行的同时，侧边问一句"这里为什么这么写？"、"这个报错是什么意思？"。

## 功能

- **`/side` 命令**：在当前会话旁开一个侧边对话（继承主线截至最后一个 `turn/end` 的完整上下文）。
- **浮动侧边面板**：右下角「💬 侧聊」按钮开关；面板内可新建、切换、关闭侧边对话。
- **实时问答**：侧聊会话走与主对话相同的消息通道（`session.prompt`），流式渲染、可停止。
- **并发不中断**：侧聊 agent 与主 agent 同进程并发运行，主任务不被打断。
- **普通持久化**：侧聊会话按普通会话持久化，`meta.parentSession` 记录归属父会话。
- **不污染主线**：`/side` 只在主线程日志里留一条命令卡片，不进入模型上下文。

## 安装

```sh
dsh plugin --profile web add dsh-sidechat
```

重启 `dsh web`（或刷新浏览器）后生效。

## 使用

1. 在浏览器中打开 GUI（默认 http://127.0.0.1:3080）。
2. 点右下角「💬 侧聊」，或直接输入 `/side`。
3. 在面板里点「＋ 新建」开一个侧边对话，然后输入问题。

## 工作原理

- **Host 半**（`src/index.ts`）：注册 `/side-chat` 路由（`open`/`list`/`close`）与 `/side` 命令。`open` 复用 DSH 的 fork 语义——以父会话「最后一个 `turn/end` 起、延伸到下一个 `turn/start` 之前」的完整日志前缀为种子，通过 `ctx.agents.create` 创建子 agent，并继承父会话的 agent preset 组合与模型选择。
- **Client 半**（`src/client/`）：通过 `ctx.sessions` 绑定侧聊会话、打开其事件窗口（`session.open()`），订阅实时会话快照渲染紧凑 transcript；消息经 `session.prompt()` 投递。
- **注册表**：进程内 `Map<sideSessionId, parentSessionId>` 记录分组；进程重启后侧聊会话仍在（普通持久化），但分组关系需后续迭代用 `ctx.storageDomain` 持久化。

## 开发

```sh
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest（host 9 + client 4）
pnpm build         # tsc 声明 + tsdown 产物（lib/index.js + lib/client.js）
pnpm pack          # 发布用 tarball
```

## 已知限制（后续迭代）

- 进程重启后侧聊的「分组关系」暂不持久化（会话本身持久化）。
- 面板列表用 3s 轮询刷新（`/side` 命令新开的侧聊最长 3s 后出现）。
- 侧聊继承上下文截至最后一个 `turn/end`（与 DSH fork 一致），进行中的 turn 无法继承。
