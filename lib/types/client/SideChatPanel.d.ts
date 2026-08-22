import { sideChatApi } from './api.ts';
/** Minimal observable the panel subscribes to (structural subset). */
interface Observable<T> {
    subscribe(fn: () => void): () => void;
    getSnapshot(): T;
}
/** Minimal session face the panel uses (structural subset of SessionFace). */
interface SideSession {
    open(): Promise<void>;
    subscribe(fn: () => void): () => void;
    getSnapshot(): unknown;
    prompt(content: readonly unknown[], mode: 'queue' | 'steer'): Promise<unknown>;
    cancel(): Promise<unknown>;
}
/** The runtime `sessions` face the panel needs (structural subset of ISessions). */
export interface SessionsFace {
    list: Observable<{
        current?: string;
        byId: Record<string, unknown>;
    }>;
    binding(id: string): {
        session: SideSession;
    } | undefined;
}
/** Panel props: the injected sessions face plus the plugin's own API. */
export interface SideChatPanelProps {
    sessions: SessionsFace;
    api: typeof sideChatApi;
}
/**
 * The plugin's whole browser surface: floating toggle + side-chat panel.
 * @param props - sessions face and the host API.
 */
export declare function SideChatPanel({ sessions, api }: SideChatPanelProps): import("react").JSX.Element;
export {};
