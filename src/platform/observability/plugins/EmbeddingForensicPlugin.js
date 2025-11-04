/**
 * EmbeddingForensicPlugin.js
 *
 * Forensic wrapper for embedding generation operations.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class EmbeddingForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "embeddings", features);
	}
}

export default EmbeddingForensicPlugin;
