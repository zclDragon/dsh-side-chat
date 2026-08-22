import { PLUGIN_ID, ROUTE_PREFIX, SIDE_COMMAND } from "./invariant.js";
import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { resolveSessionPreset } from "@deepseek-ai/dsh-agent-presets";
//#region src/index.ts
/**
* dsh-sidechat host half: Codex-style `/side` side conversations.
*
* A side chat is a fork of the parent session — same completed-turn prefix as
* a model-visible fork, same agent preset composition — created as an ordinary
* live Agent under the parent's workspace. It is NOT shown as the active
* conversation: the plugin keeps a small registry (sideSessionId → parent) so
* the GUI can group side chats under their parent and open them in the
* floating side panel, while the main task keeps running uninterrupted.
*
* Message posting reuses the stock host `session.prompt` path (any live
* session), so this plugin adds no message transport of its own — it only
* opens/closes/list the side-session lifecycle over its own `/side-chat`
* routes, and exposes the `/side` human command as the keyboard entry point.
*
* Security note: the routes are served through the same webServer as /api and
* must be reachable only from the trusted web client. They are thin — they
* take a sessionId and an optional prompt and delegate to existing host
* services; there is no new capability a malicious caller gains beyond
* forking sessions it could already fork.
*
* @module dsh-sidechat
*/
/** Plugin identity for cordis.yml rows. */
const name = "dsh-sidechat";
/** Services required before mounting. */
const inject = [
	"webServer",
	"sessions",
	"agents",
	"commands",
	"agentPresets"
];
const Config = z.object({ description: z.string().default("打开一个继承当前对话上下文的临时侧边对话（不打断主任务）") });
/** Structured failure for the /side-chat routes. */
var SideChatError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
		this.name = "SideChatError";
	}
};
/** Read and decode a JSON request body (bounded). */
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 65536) {
				reject(new SideChatError(413, "request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (chunks.length === 0) {
				resolve(void 0);
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(new SideChatError(400, "request body is not valid JSON"));
			}
		});
		req.on("error", reject);
	});
}
/** Write a JSON response. */
function writeJson(res, status, payload) {
	const text = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(text);
}
/**
* Replicate the host's fork composition: resolve the session's recorded
* preset and mount it on the child agent, so the seeded history runs under
* the same tools/persona that produced it. Mirrors `composeAgent` in the
* host api-proxy (without the web model-selection store wiring, which this
* plugin does not need).
*/
async function composeAgentFor(ctx, presetId) {
	const presets = ctx.get("agentPresets");
	if (presets === void 0) return { setup: async () => {} };
	const resolvedId = (await presets.resolve(presetId)).id;
	return {
		agentPreset: resolvedId,
		setup: async (agentCtx) => {
			await presets.mount(agentCtx, resolvedId);
		}
	};
}
/**
* The balanced completed-turn prefix of a session's log, extended through
* trailing out-of-band appends up to the next turn/start — the same seed the
* host's `session.fork` computes, so a side chat inherits exactly the context
* a fork would.
*/
function sideChatSeed(parent) {
	const events = parent.events;
	const boundary = events.findLast((e) => e.type === "turn/end");
	if (boundary === void 0) return void 0;
	let cut = boundary.seq + 1;
	while (cut < events.length && events[cut]?.type !== "turn/start") cut++;
	return events.slice(0, cut);
}
/**
* The child's agent options inherited from the parent's last logged model
* selection, so the side chat runs on the same model the parent is using.
*/
function inheritedAgentOptions(parent) {
	const config = parent.requestHeader()?.config;
	if (config === void 0) return void 0;
	return {
		provider: config.provider,
		model: config.model
	};
}
/**
* Plugin body: installs the /side-chat routes, the durable (in-process)
* side-chat registry, and the /side human command.
* @param ctx - the host root context.
* @param config - validated plugin config.
*/
function apply(ctx, config) {
	const description = config?.description ?? "打开一个继承当前对话上下文的临时侧边对话（不打断主任务）";
	const registry = /* @__PURE__ */ new Map();
	/** Create a side chat for a parent session. */
	async function openSideChat(parentSessionId) {
		const parent = ctx.sessions.get(parentSessionId);
		if (parent === void 0) throw new SideChatError(404, `parent session "${parentSessionId}" not found`);
		const seed = sideChatSeed(parent);
		if (seed === void 0 || seed.length === 0) throw new SideChatError(409, `parent session "${parentSessionId}" has no completed turn to fork from`);
		const composition = await composeAgentFor(ctx, resolveSessionPreset({
			header: parent.header,
			events: parent.events
		}));
		const childId = `session-${randomUUID()}`;
		const handle = await ctx.agents.create({
			sessionId: childId,
			seed,
			meta: {
				...parent.header.cwd === void 0 ? {} : { cwd: parent.header.cwd },
				parentSession: parentSessionId,
				seedLength: seed.length,
				...composition.agentPreset === void 0 ? {} : { agentPreset: composition.agentPreset }
			},
			...inheritedAgentOptions(parent) === void 0 ? {} : { agentOptions: inheritedAgentOptions(parent) },
			setup: composition.setup
		});
		registry.set(childId, {
			parentSessionId,
			createdAt: Date.now(),
			handle
		});
		return childId;
	}
	/** List side chats of one parent, newest first. */
	function listSideChats(parentSessionId) {
		const rows = [];
		for (const [sideSessionId, record] of registry) {
			if (record.parentSessionId !== parentSessionId) continue;
			const agent = ctx.agents.get(sideSessionId);
			rows.push({
				sideSessionId,
				parentSessionId,
				createdAt: record.createdAt,
				running: agent?.status === "running"
			});
		}
		return rows.sort((a, b) => b.createdAt - a.createdAt);
	}
	/**
	* Close a side chat: dispose the agent (removes the live session → the GUI
	* drops it via `host/session-removed`) and archive the session so it stays
	* hidden from the workspace tree even though the persisted log remains
	* (DSH has no persisted-log delete; archiving is the native "removed from
	* view" operation the workspace browser honors).
	*/
	async function closeSideChat(sideSessionId) {
		const record = registry.get(sideSessionId);
		if (record === void 0) throw new SideChatError(404, `side chat "${sideSessionId}" not found`);
		registry.delete(sideSessionId);
		const handle = record.handle;
		try {
			await handle.dispose();
		} finally {
			const workspaces = ctx.get("workspaceRegistry");
			if (workspaces !== void 0) await workspaces.archiveSession(sideSessionId).catch((error) => {
				ctx.logger.warn(`[dsh-sidechat] archive "${sideSessionId}" failed: ${String(error)}`);
			});
		}
	}
	ctx.effect(() => {
		return ctx.webServer.register({
			kind: "prefix",
			path: ROUTE_PREFIX,
			handler: async (req, res) => {
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const path = url.pathname.replace(/\/+$/, "") || "/side-chat";
					if (req.method === "POST" && path === `/side-chat/open`) {
						const parentSessionId = (await readJsonBody(req))?.parentSessionId;
						if (typeof parentSessionId !== "string") throw new SideChatError(400, "missing string field: parentSessionId");
						writeJson(res, 200, { sideSessionId: await openSideChat(parentSessionId) });
						return;
					}
					if (req.method === "GET" && path === `/side-chat/list`) {
						const parentSessionId = url.searchParams.get("parentSessionId");
						if (parentSessionId === null) throw new SideChatError(400, "missing query param: parentSessionId");
						writeJson(res, 200, { sideChats: listSideChats(parentSessionId) });
						return;
					}
					if (req.method === "POST" && path === `/side-chat/close`) {
						const sideSessionId = (await readJsonBody(req))?.sideSessionId;
						if (typeof sideSessionId !== "string") throw new SideChatError(400, "missing string field: sideSessionId");
						await closeSideChat(sideSessionId);
						writeJson(res, 200, { ok: true });
						return;
					}
					writeJson(res, 404, { error: "not-found" });
				} catch (error) {
					if (error instanceof SideChatError) {
						writeJson(res, error.status, { error: error.message });
						return;
					}
					const message = error instanceof Error ? error.message : String(error);
					ctx.logger.warn(`[dsh-sidechat] route error: ${message}`);
					writeJson(res, 500, { error: message });
				}
			}
		});
	}, "dsh-sidechat: /side-chat routes");
	ctx.effect(() => {
		return ctx.commands.register({
			name: SIDE_COMMAND,
			description,
			recordInput: false,
			handler: async (invocation) => {
				const parentSessionId = invocation.agent.session.id;
				return {
					kind: "success",
					text: `已打开侧边对话（${await openSideChat(parentSessionId)}），可在侧边面板中继续提问。`
				};
			}
		});
	}, "dsh-sidechat: /side command");
}
//#endregion
export { Config, PLUGIN_ID, ROUTE_PREFIX, SIDE_COMMAND, apply, inject, name, sideChatSeed };
