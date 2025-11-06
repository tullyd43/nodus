/**
 * APIForensicPlugin.js
 *
 * Forensic wrapper for server API operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class APIForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "api", features);
	}
}

export default APIForensicPlugin;
