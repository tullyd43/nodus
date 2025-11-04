/**
 * SearchForensicPlugin.js
 *
 * Forensic wrapper for search operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class SearchForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "search", features);
	}
}

export default SearchForensicPlugin;
