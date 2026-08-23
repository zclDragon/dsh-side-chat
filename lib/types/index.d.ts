/**
 * @zhuchenglong/dsh-side-chat host half: Codex-style `/side` side conversations.
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
 * @module @zhuchenglong/dsh-side-chat
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
export { ROUTE_PREFIX, SIDE_COMMAND, PLUGIN_ID } from './invariant.ts';
/** Plugin identity for cordis.yml rows. */
export declare const name = "@zhuchenglong/dsh-side-chat";
/** Services required before mounting. */
export declare const inject: string[];
/** Plugin config. */
export interface Config {
    /** Human-readable description shown in command discovery UI. */
    description: string;
}
export declare const Config: z<Config>;
/** One registry record: a side session and its owning parent. */
export interface SideChatSummary {
    readonly sideSessionId: SessionId;
    readonly parentSessionId: SessionId;
    readonly createdAt: number;
    /** Whether the side agent is mid-turn right now. */
    readonly running: boolean;
    /** Short display title derived from the side chat's first user message. */
    readonly title: string;
}
/**
 * The balanced completed-turn prefix of a session's log, extended through
 * trailing out-of-band appends up to the next turn/start — the same seed the
 * host's `session.fork` computes, so a side chat inherits exactly the context
 * a fork would.
 */
export declare function sideChatSeed(parent: Session): readonly import('@deepseek-ai/dsh-session').SessionEvent[] | undefined;
/** Maximum length of a derived side-chat title (approximate, CJK-aware). */
export declare const SIDE_CHAT_TITLE_MAX = 24;
/**
 * Derive a short display title for a side chat from its OWN first user
 * message — DSH's title system deliberately skips sessions with a parent, so
 * side chats carry no title; this is a deterministic, recomputable label.
 *
 * The side session's log is seeded with the parent's completed-turn prefix,
 * so the boundary (`seedLength`) must be excluded: the title must come from
 * the question the user actually asked IN the side chat, never an inherited
 * parent message.
 * @param session - the side session.
 * @returns the truncated first-message text, or undefined when the session
 *   has no own user message yet.
 */
export declare function sideChatTitleOf(session: Session): string | undefined;
/**
 * Plugin body: installs the /side-chat routes, the durable (in-process)
 * side-chat registry, and the /side human command.
 * @param ctx - the host root context.
 * @param config - validated plugin config.
 */
export declare function apply(ctx: Context, config?: Config): void;
