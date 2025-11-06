/**
 * @file CryptoForensicPlugin.js
 * @description Forensic wrapper for cryptographic operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class CryptoForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "crypto", features);
	}
}
