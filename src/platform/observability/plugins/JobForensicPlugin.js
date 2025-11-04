/**
 * JobForensicPlugin.js
 *
 * Forensic wrapper for background job execution and scheduling.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class JobForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "jobs", features);
	}
}

export default JobForensicPlugin;
