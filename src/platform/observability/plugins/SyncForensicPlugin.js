/**
 * SyncForensicPlugin.js
 *
 * Forensic wrapper for synchronization operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class SyncForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "sync", features);
	}
}

export default SyncForensicPlugin;
