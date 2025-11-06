/**
 * PluginForensicPlugin.js
 *
 * Forensic wrapper for plugin lifecycle operations (install/uninstall/config).
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class PluginForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "plugins", features);
	}
}

export default PluginForensicPlugin;
