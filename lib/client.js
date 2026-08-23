window.__ModuleLoader__.load({
	id: "@zhuchenglong/dsh-side-chat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/** Structured request failure surfaced to the panel. */
		var SideChatApiError = class extends Error {
			status;
			constructor(status, message) {
				super(message);
				this.status = status;
				this.name = "SideChatApiError";
			}
		};
		async function request(path, init) {
			const response = await fetch(path, {
				...init,
				headers: {
					"content-type": "application/json",
					...init?.headers
				},
				cache: "no-store"
			});
			let payload;
			try {
				payload = await response.json();
			} catch {
				throw new SideChatApiError(response.status, `unexpected response from ${path}`);
			}
			if (!response.ok) {
				const message = payload?.error;
				throw new SideChatApiError(response.status, typeof message === "string" ? message : `request to ${path} failed`);
			}
			return payload;
		}
		/** The plugin's host API surface. */
		const sideChatApi = {
			/** Open a side chat forking a parent session; resolves the new session id. */
			open(parentSessionId) {
				return request("/side-chat/open", {
					method: "POST",
					body: JSON.stringify({ parentSessionId })
				}).then((payload) => {
					if (typeof payload.sideSessionId !== "string") throw new SideChatApiError(500, "open response missing sideSessionId");
					return payload.sideSessionId;
				});
			},
			/** List a parent session's side chats, newest first. */
			list(parentSessionId) {
				return request(`/side-chat/list?parentSessionId=${encodeURIComponent(parentSessionId)}`).then((payload) => {
					const rows = payload.sideChats;
					if (!Array.isArray(rows)) throw new SideChatApiError(500, "list response missing sideChats");
					return rows;
				});
			},
			/** Close (dispose) a side chat. */
			close(sideSessionId) {
				return request("/side-chat/close", {
					method: "POST",
					body: JSON.stringify({ sideSessionId })
				}).then(() => void 0);
			}
		};
		//#endregion
		//#region src/client/text.ts
		/** Concatenated text of a user/context content block list (text parts only). */
		function textOfContent(blocks) {
			return blocks.filter((block) => block?.type === "text").map((block) => block.text).join("\n");
		}
		/** Concatenated text of an assistant block list (text + reasoning parts). */
		function textOfAssistant(blocks) {
			return blocks.filter((block) => block?.kind === "text" || block?.kind === "reasoning").map((block) => block.text).join("\n");
		}
		/** A short single-line label for a tool result card (name or callId). */
		function toolLabel(call, callId) {
			if (call?.name != null && call.name.length > 0) return call.name;
			return callId;
		}
		//#endregion
		//#region \0dsh-css:/Users/zhuchenglong/workspace/temp/side-chat/src/client/side-chat.module.css.mjs
		const css = ".LuL-jG_toggle{z-index:2147483000;color:#e8e8ea;cursor:pointer;background:#1b1b22;border:1px solid #7f7f7f59;border-radius:999px;padding:8px 14px;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;position:fixed;bottom:16px;right:16px;box-shadow:0 4px 16px #00000059}.LuL-jG_toggle:hover{background:#26262f}.LuL-jG_panel{z-index:2147482990;color:#e8e8ea;background:#15151b;border:1px solid #7f7f7f4d;border-radius:12px;flex-direction:column;width:min(420px,100vw - 24px);font:13px/1.5 ui-sans-serif,system-ui,sans-serif;display:flex;position:fixed;top:12px;bottom:76px;right:12px;overflow:hidden;box-shadow:0 12px 40px #00000073}.LuL-jG_header{border-bottom:1px solid #7f7f7f33;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;display:flex}.LuL-jG_title{font-weight:600}.LuL-jG_titleWrap{flex-direction:column;gap:1px;min-width:0;display:flex}.LuL-jG_subtitle{color:#8a8a94;text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.LuL-jG_headerActions{gap:6px;display:flex}.LuL-jG_iconButton{color:inherit;font:inherit;cursor:pointer;background:0 0;border:1px solid #7f7f7f4d;border-radius:6px;padding:4px 10px}.LuL-jG_iconButton:hover{background:#26262f}.LuL-jG_iconButton:disabled{opacity:.5;cursor:default}.LuL-jG_errorStrip{color:#f2a1a1;white-space:pre-wrap;word-break:break-word;background:#f2a1a114;border:1px solid #f2a1a166;border-radius:6px;margin:8px 12px 0;padding:6px 10px}.LuL-jG_emptyPanel{color:#9a9aa3;text-align:center;padding:24px 16px}.LuL-jG_emptyHint{color:#6f6f79;margin-top:8px;font-size:12px}.LuL-jG_sideList{border-bottom:1px solid #7f7f7f26;flex-wrap:wrap;gap:6px;padding:8px 12px;display:flex}.LuL-jG_sideChip,.LuL-jG_sideChipActive{color:#c8c8cd;font:inherit;cursor:pointer;background:0 0;border:1px solid #7f7f7f4d;border-radius:999px;padding:3px 10px}.LuL-jG_sideChipActive{color:#dbe7ff;background:#508cff2e;border-color:#78aaff8c}.LuL-jG_chipLabel{text-overflow:ellipsis;white-space:nowrap;max-width:220px;overflow:hidden}.LuL-jG_conversation{flex-direction:column;flex:1;min-height:0;display:flex}.LuL-jG_transcriptWrap{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.LuL-jG_transcript{scrollbar-width:thin;flex-direction:column;flex:1;gap:8px;padding:12px;display:flex;overflow-y:auto}.LuL-jG_jumpBottom{color:#c8c8cd;cursor:pointer;background:#1b1b22eb;border:1px solid #7f7f7f66;border-radius:999px;padding:4px 12px;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;position:absolute;bottom:10px;right:12px;box-shadow:0 2px 8px #0000004d}.LuL-jG_jumpBottom:hover{background:#26262f}.LuL-jG_empty{color:#9a9aa3;text-align:center;padding:24px 16px}.LuL-jG_userRow{justify-content:flex-end;display:flex}.LuL-jG_userBubble{color:#e8eefb;white-space:pre-wrap;word-break:break-word;background:#508cff2e;border-radius:10px 10px 2px;max-width:85%;padding:6px 10px}.LuL-jG_assistantRow{word-break:break-word;color:#e8e8ea}.LuL-jG_toolRow{color:#8a8a94;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.LuL-jG_thinking{color:#8a8a94}.LuL-jG_composer{border-top:1px solid #7f7f7f33;flex-direction:column;gap:6px;padding:8px 12px 4px;display:flex}.LuL-jG_composerInput{box-sizing:border-box;resize:none;color:#e8e8ea;width:100%;font:inherit;background:#1b1b22;border:1px solid #7f7f7f59;border-radius:8px;padding:8px 10px}.LuL-jG_composerInput:focus{border-color:#78aaff99;outline:none}.LuL-jG_composerActions{justify-content:flex-end;display:flex}.LuL-jG_sendButton,.LuL-jG_stopButton,.LuL-jG_closeButton{color:inherit;font:inherit;cursor:pointer;background:0 0;border:1px solid #7f7f7f4d;border-radius:6px;padding:5px 14px}.LuL-jG_sendButton{color:#dbe7ff;background:#508cff40;border-color:#78aaff80}.LuL-jG_sendButton:disabled{opacity:.5;cursor:default}.LuL-jG_stopButton{color:#f2c1c1;background:#f2a1a126;border-color:#f2a1a166}.LuL-jG_footer{justify-content:space-between;align-items:center;gap:8px;padding:6px 12px 8px;display:flex}.LuL-jG_footerId{color:#6f6f79;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow:hidden}.LuL-jG_closeButton{color:#b8b8c0;padding:3px 10px}";
		const tagId = "@zhuchenglong/dsh-side-chat/side-chat.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@zhuchenglong/dsh-side-chat";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var side_chat_module_css_default = {
			"composerInput": "LuL-jG_composerInput",
			"toggle": "LuL-jG_toggle",
			"sendButton": "LuL-jG_sendButton",
			"emptyHint": "LuL-jG_emptyHint",
			"title": "LuL-jG_title",
			"toolRow": "LuL-jG_toolRow",
			"subtitle": "LuL-jG_subtitle",
			"sideChip": "LuL-jG_sideChip",
			"jumpBottom": "LuL-jG_jumpBottom",
			"composerActions": "LuL-jG_composerActions",
			"userBubble": "LuL-jG_userBubble",
			"iconButton": "LuL-jG_iconButton",
			"footer": "LuL-jG_footer",
			"headerActions": "LuL-jG_headerActions",
			"chipLabel": "LuL-jG_chipLabel",
			"conversation": "LuL-jG_conversation",
			"assistantRow": "LuL-jG_assistantRow",
			"sideChipActive": "LuL-jG_sideChipActive",
			"footerId": "LuL-jG_footerId",
			"empty": "LuL-jG_empty",
			"header": "LuL-jG_header",
			"transcriptWrap": "LuL-jG_transcriptWrap",
			"closeButton": "LuL-jG_closeButton",
			"transcript": "LuL-jG_transcript",
			"thinking": "LuL-jG_thinking",
			"titleWrap": "LuL-jG_titleWrap",
			"userRow": "LuL-jG_userRow",
			"emptyPanel": "LuL-jG_emptyPanel",
			"panel": "LuL-jG_panel",
			"errorStrip": "LuL-jG_errorStrip",
			"stopButton": "LuL-jG_stopButton",
			"sideList": "LuL-jG_sideList",
			"composer": "LuL-jG_composer"
		};
		//#endregion
		//#region src/client/CompactTranscript.tsx
		/**
		* Compact transcript for a side chat: a lightweight render of the runtime's
		* conversation nodes (user messages, assistant text, tool summaries, command
		* cards) plus the live partial while the side agent streams. This is an
		* intentionally small subset of the full conversation UI — side chats are for
		* quick Q&A, so tool details and queue chrome stay out.
		*
		* Scroll behavior: new content auto-scrolls to the bottom while the user is
		* near the bottom (following the conversation). When the user scrolls up to
		* read, following pauses and a "回到底部" pill appears to jump back down.
		* @module dsh-side-chat/compact-transcript
		*/
		/** Distance from the bottom (px) that still counts as "following". */
		const PIN_THRESHOLD = 48;
		/** Rendered transcript row. */
		function Row({ node }) {
			switch (node.kind) {
				case "user": {
					const text = textOfContent(node.content ?? []);
					if (text.length === 0) return null;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: side_chat_module_css_default.userRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: side_chat_module_css_default.userBubble,
							children: text
						})
					});
				}
				case "assistant": {
					const text = textOfAssistant(node.blocks ?? []);
					if (text.length === 0) return null;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: side_chat_module_css_default.assistantRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text })
					});
				}
				case "tool-result": {
					const label = toolLabel(node.call, node.callId ?? String(node.seq));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: side_chat_module_css_default.toolRow,
						children: ["⚙ ", label]
					});
				}
				case "command": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: side_chat_module_css_default.toolRow,
					children: ["／", node.name ?? "command"]
				});
				case "compaction": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: side_chat_module_css_default.toolRow,
					children: "🗜 上下文已压缩"
				});
				default: return null;
			}
		}
		/**
		* Render one side chat's transcript with follow-the-latest scroll.
		* @param props - the conversation snapshot (structural) to render.
		*/
		function CompactTranscript({ snapshot }) {
			const scrollRef = (0, react.useRef)(null);
			const [following, setFollowing] = (0, react.useState)(true);
			(0, react.useEffect)(() => {
				if (!following) return;
				const el = scrollRef.current;
				if (el === null) return;
				el.scrollTop = el.scrollHeight;
			}, [snapshot, following]);
			const onScroll = () => {
				const el = scrollRef.current;
				if (el === null) return;
				const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
				if (nearBottom !== following) setFollowing(nearBottom);
			};
			const jumpToBottom = () => {
				const el = scrollRef.current;
				if (el === null) return;
				el.scrollTop = el.scrollHeight;
				setFollowing(true);
			};
			const nodes = snapshot.nodes;
			if (!(nodes.length > 0 || snapshot.partial !== null || snapshot.running)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: side_chat_module_css_default.empty,
				children: "侧边对话已就绪，输入你的问题。"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: side_chat_module_css_default.transcriptWrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: side_chat_module_css_default.transcript,
					ref: scrollRef,
					onScroll,
					children: [
						nodes.map((node) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, { node }, node.seq)),
						snapshot.partial !== null && textOfAssistant(snapshot.partial.blocks ?? []).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: side_chat_module_css_default.assistantRow,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
								text: textOfAssistant(snapshot.partial.blocks),
								streaming: true
							})
						}),
						snapshot.running && snapshot.partial === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: side_chat_module_css_default.thinking,
							children: "思考中…"
						})
					]
				}), !following && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: side_chat_module_css_default.jumpBottom,
					onClick: jumpToBottom,
					title: "回到底部",
					children: "↓ 回到底部"
				})]
			});
		}
		//#endregion
		//#region src/client/Composer.tsx
		/**
		* Side-chat composer: a single textarea + send, with a stop button while the
		* side agent is running. Posts through the runtime session's `prompt` verb
		* (the same path the main composer uses).
		* @module dsh-side-chat/composer
		*/
		/**
		* Render the composer.
		* @param props - the side session object (methods are invoked on it so `this`
		*   stays bound — extracting `session.prompt` would lose the receiver), the
		*   running flag, and an error reporter.
		*/
		function Composer({ session, running, onError }) {
			const [draft, setDraft] = (0, react.useState)("");
			const [sending, setSending] = (0, react.useState)(false);
			const submit = async () => {
				const text = draft.trim();
				if (text.length === 0 || sending) return;
				setDraft("");
				setSending(true);
				try {
					const result = await session.prompt([{
						type: "text",
						text
					}], "queue");
					if (result != null && typeof result === "object" && "ok" in result && result.ok === false) {
						const err = result.error;
						onError(err?.message ?? "消息发送失败");
					}
				} catch (cause) {
					onError(cause instanceof Error ? cause.message : "消息发送失败");
				} finally {
					setSending(false);
				}
			};
			const stop = () => {
				session.cancel();
			};
			const onSubmit = (event) => {
				event.preventDefault();
				submit();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: side_chat_module_css_default.composer,
				onSubmit,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
					className: side_chat_module_css_default.composerInput,
					rows: 3,
					value: draft,
					placeholder: "向侧边对话提问…（Enter 发送，Shift+Enter 换行）",
					onChange: (event) => setDraft(event.target.value),
					onKeyDown: (event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							submit();
						}
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: side_chat_module_css_default.composerActions,
					children: running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: side_chat_module_css_default.stopButton,
						onClick: stop,
						children: "停止"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						className: side_chat_module_css_default.sendButton,
						disabled: draft.trim().length === 0 || sending,
						children: "发送"
					})
				})]
			});
		}
		//#endregion
		//#region src/client/SideChatPanel.tsx
		/**
		* The side-chat panel: a floating toggle (bottom-right) that opens a panel
		* showing the current conversation's side chats. Selecting one renders its
		* live transcript (opened through the runtime session window) with a composer
		* that posts through the standard `prompt` verb — so the side agent runs
		* concurrently without interrupting the main task.
		*
		* The panel binds sessions purely through the runtime's `sessions` face: the
		* active parent is `sessions.list.current`, and each side session's live
		* conversation comes from `sessions.binding(id).session` (opened via its
		* `open()` verb so the host streams its events).
		* @module dsh-side-chat/panel
		*/
		/** How long to wait for a freshly opened side session to appear in the list. */
		const LIST_POLL_MS = 200;
		const LIST_POLL_MAX = 20;
		/** Wait until a session id is listed (the host pushes session/created async). */
		function waitForListed(sessions, id) {
			return new Promise((resolve) => {
				let tries = 0;
				const tick = () => {
					tries += 1;
					if (sessions.list.getSnapshot().byId[id] !== void 0 || tries >= LIST_POLL_MAX) {
						resolve();
						return;
					}
					setTimeout(tick, LIST_POLL_MS);
				};
				tick();
			});
		}
		/**
		* The plugin's whole browser surface: floating toggle + side-chat panel.
		* @param props - sessions face and the host API.
		*/
		function SideChatPanel({ sessions, api }) {
			const listState = (0, react.useSyncExternalStore)((fn) => sessions.list.subscribe(fn), () => sessions.list.getSnapshot());
			const parentId = listState.current;
			const [visible, setVisible] = (0, react.useState)(false);
			const [sides, setSides] = (0, react.useState)([]);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!visible || parentId === void 0) {
					setSides([]);
					setSelectedId(null);
					return;
				}
				let alive = true;
				const refresh = async () => {
					try {
						const list = await api.list(parentId);
						if (!alive) return;
						setSides(list);
						setSelectedId((prev) => {
							if (prev !== null && list.some((s) => s.sideSessionId === prev)) return prev;
							return list[0]?.sideSessionId ?? null;
						});
					} catch (cause) {
						if (alive) setError(cause instanceof Error ? cause.message : String(cause));
					}
				};
				refresh();
				const interval = setInterval(() => {
					refresh();
				}, 3e3);
				return () => {
					alive = false;
					clearInterval(interval);
				};
			}, [
				visible,
				parentId,
				api
			]);
			const open = async () => {
				if (parentId === void 0 || busy) return;
				setBusy(true);
				setError(null);
				try {
					const id = await api.open(parentId);
					await waitForListed(sessions, id);
					setVisible(true);
					const list = await api.list(parentId);
					setSides(list);
					setSelectedId(id);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			};
			const close = async (id) => {
				try {
					await api.close(id);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
				if (parentId !== void 0) {
					const list = await api.list(parentId);
					setSides(list);
					setSelectedId((prev) => prev === id ? list[0]?.sideSessionId ?? null : prev);
				}
			};
			const session = (selectedId === null ? void 0 : sessions.binding(selectedId))?.session;
			(0, react.useEffect)(() => {
				if (session !== void 0) session.open();
			}, [session]);
			const snapshot = (0, react.useSyncExternalStore)((fn) => session === void 0 ? () => {} : session.subscribe(fn), () => session === void 0 ? void 0 : session.getSnapshot());
			const selected = selectedId === null ? void 0 : sides.find((s) => s.sideSessionId === selectedId);
			const running = snapshot?.running === true || selected?.running === true;
			const parentTitle = parentId === void 0 ? void 0 : listState.byId[parentId]?.displayTitle;
			const closeAll = async () => {
				for (const side of sides) try {
					await api.close(side.sideSessionId);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
				setSides([]);
				setSelectedId(null);
			};
			const toggle = () => {
				setVisible((v) => !v);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: side_chat_module_css_default.toggle,
				onClick: toggle,
				title: "侧边对话（/side）",
				"aria-label": "侧边对话",
				children: ["💬 侧聊", visible ? " ✕" : ""]
			}), visible && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: side_chat_module_css_default.panel,
				"aria-label": "侧边对话面板",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: side_chat_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: side_chat_module_css_default.titleWrap,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: side_chat_module_css_default.title,
								children: "侧边对话"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: side_chat_module_css_default.subtitle,
								children: [
									parentTitle ?? "当前会话",
									" · ",
									sides.length,
									" 个"
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: side_chat_module_css_default.headerActions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: side_chat_module_css_default.iconButton,
									onClick: () => {
										closeAll();
									},
									disabled: sides.length === 0,
									title: "关闭全部侧边对话",
									children: "全部关闭"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: side_chat_module_css_default.iconButton,
									onClick: () => {
										open();
									},
									disabled: busy || parentId === void 0,
									title: "新建侧边对话",
									children: "＋ 新建"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: side_chat_module_css_default.iconButton,
									onClick: toggle,
									title: "收起",
									children: "✕"
								})
							]
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: side_chat_module_css_default.errorStrip,
						children: error
					}),
					sides.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: side_chat_module_css_default.emptyPanel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "还没有侧边对话。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: side_chat_module_css_default.emptyHint,
							children: "侧边对话是当前主对话的临时分叉：继承已完成的上下文、不打断主任务、不污染主线程。"
						})]
					}),
					sides.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: side_chat_module_css_default.sideList,
						children: sides.map((side, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: selectedId === side.sideSessionId ? side_chat_module_css_default.sideChipActive : side_chat_module_css_default.sideChip,
							onClick: () => setSelectedId(side.sideSessionId),
							title: side.title.length > 0 ? `侧聊：${side.title}` : `侧聊 #${index + 1}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["#", index + 1] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: side.running ? "…" : "" })]
						}, side.sideSessionId))
					}),
					selectedId !== null && session !== void 0 && snapshot !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: side_chat_module_css_default.conversation,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactTranscript, { snapshot: {
								nodes: snapshot.nodes ?? [],
								partial: snapshot.partial ?? null,
								running
							} }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Composer, {
								session,
								running,
								onError: (message) => setError(message)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: side_chat_module_css_default.footer,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: side_chat_module_css_default.footerId,
									children: ["#", selected?.sideSessionId]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: side_chat_module_css_default.closeButton,
									onClick: () => {
										close(selectedId);
									},
									children: "关闭此侧聊"
								})]
							})
						]
					})
				]
			})] });
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* Client half of dsh-side-chat: mounts the floating side-chat panel into a
		* document.body host (the better-sidebar portal pattern — the panel floats
		* above the app, outside the layout columns, so no core slot changes are
		* needed). The panel binds sessions purely through `ctx.sessions`.
		* @module dsh-side-chat/client
		*/
		/** Required services before mounting. */
		const inject = ["sessions"];
		/**
		* Client plugin body: create one host element and mount the panel.
		* @param ctx - the client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const host = document.createElement("div");
				host.setAttribute("data-dsh-side-chat", "");
				document.body.appendChild(host);
				const root = (0, react_dom_client.createRoot)(host);
				root.render((0, react.createElement)(SideChatPanel, {
					sessions: ctx.sessions,
					api: sideChatApi
				}));
				return () => {
					root.unmount();
					host.remove();
				};
			}, "dsh-side-chat: panel mount");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map