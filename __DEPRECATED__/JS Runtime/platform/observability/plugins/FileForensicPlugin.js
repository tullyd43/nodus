/**
 * FileForensicPlugin.js
 *
 * Forensic wrapper for file operations (reads/writes/uploads).
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class FileForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "files", features);
	}
}

export default FileForensicPlugin;
