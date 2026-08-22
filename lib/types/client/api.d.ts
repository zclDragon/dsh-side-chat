/**
 * Thin typed client for the plugin's own /side-chat host routes. Same-origin
 * fetch (the GUI and the host webServer share one origin).
 * @module dsh-sidechat/api
 */
/** One side chat as the host registry reports it. */
export interface SideChatSummary {
    readonly sideSessionId: string;
    readonly parentSessionId: string;
    readonly createdAt: number;
    readonly running: boolean;
}
/** Structured request failure surfaced to the panel. */
export declare class SideChatApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** The plugin's host API surface. */
export declare const sideChatApi: {
    /** Open a side chat forking a parent session; resolves the new session id. */
    open(parentSessionId: string): Promise<string>;
    /** List a parent session's side chats, newest first. */
    list(parentSessionId: string): Promise<SideChatSummary[]>;
    /** Close (dispose) a side chat. */
    close(sideSessionId: string): Promise<void>;
};
