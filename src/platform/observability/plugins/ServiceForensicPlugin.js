/**
 * ServiceForensicPlugin.js
 *
 * Forensic wrapper that records service lifecycle events and important service operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class ServiceForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "service", features);
	}
}

export default ServiceForensicPlugin;
