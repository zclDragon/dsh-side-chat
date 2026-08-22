/**
 * Companion invariants for dsh-sidechat. The package-level constant lives
 * here (not in index.ts) so invariant suites can import it without pulling
 * the plugin's full module graph.
 * @module dsh-sidechat/invariant
 */
/** The Cordis plugin entry id used in cordis.patch.yml mount rows. */
export declare const PLUGIN_ID = "side-chat";
/** The webServer route prefix this plugin owns. */
export declare const ROUTE_PREFIX = "/side-chat";
/** The human command name registered by this plugin (without the leading slash). */
export declare const SIDE_COMMAND = "side";
