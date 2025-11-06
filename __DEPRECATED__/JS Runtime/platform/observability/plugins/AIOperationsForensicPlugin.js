/**
 * AIOperationsForensicPlugin.js
 *
 * Forensic wrapper for general AI operation tasks (chat completions, pipelines).
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class AIOperationsForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "ai", features);
	}
}

export default AIOperationsForensicPlugin;
