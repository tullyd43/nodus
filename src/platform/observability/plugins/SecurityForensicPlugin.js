/**
 * SecurityForensicPlugin.js
 *
 * Provides forensic instrumentation for security-related operations
 * (authentication, authorization, policy changes). Lightweight and
 * non-blocking; records envelopes via forensicLogger when available.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class SecurityForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "security", features);
	}
}

export default SecurityForensicPlugin;
