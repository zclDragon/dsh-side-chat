/** The composer's session verbs (structural subset of SessionFace). */
export interface ComposerSession {
    prompt(content: readonly unknown[], mode: 'queue' | 'steer'): Promise<unknown>;
    cancel(): Promise<unknown>;
}
/**
 * Render the composer.
 * @param props - the side session object (methods are invoked on it so `this`
 *   stays bound — extracting `session.prompt` would lose the receiver), the
 *   running flag, and an error reporter.
 */
export declare function Composer({ session, running, onError }: {
    session: ComposerSession;
    running: boolean;
    onError: (message: string) => void;
}): import("react").JSX.Element;
