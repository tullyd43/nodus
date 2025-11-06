/**
 * HealthForensicPlugin.js
 *
 * Forensic wrapper for health checks and system probes.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class HealthForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "health", features);
	}
}

export default HealthForensicPlugin;
