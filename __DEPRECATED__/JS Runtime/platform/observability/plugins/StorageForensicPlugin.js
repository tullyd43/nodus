/**
 * @class StorageForensicPlugin
 * @description Provides forensic instrumentation for all storage operations.
 * Creates a complete data lineage audit trail with classification tracking,
 * adhering to Nodus platform mandates for observability and performance.
 */
import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

export class StorageForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "storage", features);
	}

	/**
	 * Gets the classification level for a storage store based on internal rules.
	 * @private
	 * @param {string} storeName - The name of the store.
	 * @returns {string} The classification level (e.g., 'CONFIDENTIAL', 'SECRET').
	 */
	classifyOperation(storeName) {
		// Renamed to align with BaseForensicPlugin's classifyOperation
		const classificationMap = {
			objects: "CONFIDENTIAL",
			events: "CONFIDENTIAL",
			links: "CONFIDENTIAL",
			configurations: "SECRET",
			encrypted_fields: "SECRET",
			security_events: "TOP_SECRET",
			audit_logs: "TOP_SECRET",
		};
		return classificationMap[storeName] || "UNCLASSIFIED";
	}
}
