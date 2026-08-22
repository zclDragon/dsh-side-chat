/** Structural subset of the runtime conversation snapshot we read. */
export interface TranscriptSnapshot {
    nodes: readonly unknown[];
    partial: {
        blocks: readonly unknown[];
    } | null;
    running: boolean;
}
/**
 * Render one side chat's transcript with follow-the-latest scroll.
 * @param props - the conversation snapshot (structural) to render.
 */
export declare function CompactTranscript({ snapshot }: {
    snapshot: TranscriptSnapshot;
}): import("react").JSX.Element;
