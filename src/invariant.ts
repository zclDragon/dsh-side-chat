/**
 * Companion invariants for dsh-side-chat. The package-level constant lives
 * here (not in index.ts) so invariant suites can import it without pulling
 * the plugin's full module graph.
 * @module dsh-side-chat/invariant
 */

/** The Cordis plugin entry id used in cordis.patch.yml mount rows. */
export const PLUGIN_ID = 'side-chat'

/** The webServer route prefix this plugin owns. */
export const ROUTE_PREFIX = '/side-chat'

/** The human command name registered by this plugin (without the leading slash). */
export const SIDE_COMMAND = 'side'
