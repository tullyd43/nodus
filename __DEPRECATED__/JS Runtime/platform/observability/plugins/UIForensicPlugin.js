/**
 * UIForensicPlugin.js
 *
 * Forensic wrapper for UI operations and user interactions.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class UIForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "ui", features);
	}
}

export default UIForensicPlugin;
