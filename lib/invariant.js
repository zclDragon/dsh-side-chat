//#region src/invariant.ts
/**
* Companion invariants for dsh-sidechat. The package-level constant lives
* here (not in index.ts) so invariant suites can import it without pulling
* the plugin's full module graph.
* @module dsh-sidechat/invariant
*/
/** The Cordis plugin entry id used in cordis.patch.yml mount rows. */
const PLUGIN_ID = "side-chat";
/** The webServer route prefix this plugin owns. */
const ROUTE_PREFIX = "/side-chat";
/** The human command name registered by this plugin (without the leading slash). */
const SIDE_COMMAND = "side";
//#endregion
export { PLUGIN_ID, ROUTE_PREFIX, SIDE_COMMAND };
