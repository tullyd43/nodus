/**
 * DatabaseForensicPlugin.js
 *
 * Forensic wrapper for database operations (queries, transactions).
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class DatabaseForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "database", features);
	}
}

export default DatabaseForensicPlugin;
