/**
 * I18nForensicPlugin.js
 *
 * Forensic wrapper for internationalization (translation) operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class I18nForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "i18n", features);
	}
}

export default I18nForensicPlugin;
