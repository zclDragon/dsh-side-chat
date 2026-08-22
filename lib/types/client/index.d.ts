import type { Context } from '@deepseek-ai/cordis';
/** Required services before mounting. */
export declare const inject: string[];
/**
 * Client plugin body: create one host element and mount the panel.
 * @param ctx - the client root context.
 */
export declare function apply(ctx: Context): void;
