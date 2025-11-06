/**
 * ConfigForensicPlugin.js
 *
 * Forensic wrapper for configuration changes and reads.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class ConfigForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "config", features);
	}
}

export default ConfigForensicPlugin;
