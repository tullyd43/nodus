/**
 * PolicyForensicPlugin.js
 *
 * Forensic wrapper that records policy evaluations and policy change events.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class PolicyForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "policy", features);
	}
}

export default PolicyForensicPlugin;
