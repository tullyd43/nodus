/**
 * NetworkForensicPlugin.js
 *
 * Provides lightweight forensic wrapping for outbound network calls (CDS transport).
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class NetworkForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "network", features);
	}
}

export default NetworkForensicPlugin;
