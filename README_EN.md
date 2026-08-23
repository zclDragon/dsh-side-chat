# @zhuchenglong/dsh-side-chat

[![npm version](https://img.shields.io/npm/v/@zhuchenglong/dsh-side-chat)](https://www.npmjs.com/package/@zhuchenglong/dsh-side-chat)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Codex-style `/side` side conversations for the DeepSeek Harness Web GUI.

While your main task runs, open a **temporary fork of the current chat** in a
floating panel: it inherits the main thread's completed context, never
interrupts the running task, and never pollutes the main thread's model
context. Perfect for "ask while working" — "why did you implement it this
way?", "what does this error mean?", "what was the signature again?"

## Features

- **`/side` command** — open a side conversation beside the current session
  (inherits context up to the last completed `turn/end`).
- **Floating panel** — a「💬 侧聊」toggle in the bottom-right corner; create,
  switch, and close side chats from the panel.
- **Live Q&A** — side chats post through the same message channel as the main
  conversation (`session.prompt`), stream in real time, and can be stopped.
- **Markdown rendering** — replies render with the same `MarkdownText` the
  main conversation uses (headings, code blocks, tables, math), with
  follow-the-latest auto-scroll.
- **Concurrent, non-blocking** — the side agent runs in the same process
  alongside the main agent; your main task keeps going.
- **Close = removed** — closing a side chat disposes its agent and archives
  the session, so it disappears from the panel and the sidebar.
- **Parent-aware** — the panel header shows the parent conversation and side
  count; chips stay `#N`, hovering shows the side chat's own first question.
- **Clean main thread** — `/side` leaves only a command card in the main log,
  never model context.

## Install

```sh
dsh plugin --profile web add @zhuchenglong/dsh-side-chat
```

Or install from GitHub:

```sh
dsh plugin --profile web add github:zclDragon/dsh-side-chat#main
```

Restart `dsh web` (or refresh the browser) to pick it up.

## Usage

1. Open the GUI in your browser (default http://127.0.0.1:3080).
2. Click「💬 侧聊」in the bottom-right corner, or type `/side`.
3. Click「＋ 新建」to open a side chat, then ask your question.

## How it works

- **Host half** (`src/index.ts`): registers the `/side-chat` routes
  (`open`/`list`/`close`) and the `/side` command. `open` reuses DSH's fork
  semantics — the seed is the parent's complete log prefix from the last
  `turn/end` up to (not including) the next `turn/start` — then creates a
  child agent with `ctx.agents.create`, inheriting the parent's agent-preset
  composition and model selection. The panel header title is derived from the
  side chat's *own* first user message (bounded by `seedLength`, so inherited
  parent messages are never used).
- **Client half** (`src/client/`): binds side sessions through `ctx.sessions`,
  opens their event window (`session.open()`), subscribes to the live
  conversation snapshot, and renders a compact markdown transcript; messages
  post via `session.prompt()`.
- **Registry**: an in-process `Map<sideSessionId, parentSessionId>` records
  grouping; when a parent session is disposed, every descendant side chat is
  disposed too (orphan cleanup).

## Development

```sh
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest (host + client)
pnpm build         # tsc declarations + tsdown artifacts (lib/index.js + lib/client.js)
pnpm pack          # publish tarball
```

## Known limitations (next iterations)

- The side-chat grouping registry is in-process; a process restart loses the
  grouping (the sessions themselves persist). A durable registry via
  `ctx.storageDomain` is planned.
- The panel list refreshes on a 3s poll (a side chat opened via `/side`
  appears within ~3s).
- A side chat inherits context only up to the last completed `turn/end`
  (same as a DSH fork); an in-flight turn cannot be inherited.
