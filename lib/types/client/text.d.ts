/**
 * Text-extraction helpers for the compact side-chat transcript. The helpers
 * use minimal structural types (text/assistant blocks) so they stay
 * independent of any single package's re-export surface.
 * @module dsh-sidechat/text
 */
/** A content block carrying plain text (structural subset). */
export interface TextBlockLike {
    type: 'text';
    text: string;
}
/** An assistant block carrying text or reasoning (structural subset). */
export interface AssistantBlockLike {
    kind: 'text' | 'reasoning';
    text: string;
}
/** Concatenated text of a user/context content block list (text parts only). */
export declare function textOfContent(blocks: readonly unknown[]): string;
/** Concatenated text of an assistant block list (text + reasoning parts). */
export declare function textOfAssistant(blocks: readonly unknown[]): string;
/** A short single-line label for a tool result card (name or callId). */
export declare function toolLabel(call: {
    name?: string | null;
} | null | undefined, callId: string): string;
