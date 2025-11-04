/**
 * AuthForensicPlugin.js
 *
 * Forensic wrapper for authentication/authorization operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class AuthForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "auth", features);
	}
}

export default AuthForensicPlugin;
