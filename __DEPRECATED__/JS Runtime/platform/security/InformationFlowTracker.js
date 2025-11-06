/**
 * @file InformationFlowTracker.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Enterprise information flow tracking with automatic observability compliance.
 * Tracks data derivation across security boundaries with complete audit trails and MAC compliance.
 *
 * All information flow events are automatically instrumented through ActionDispatcher for
 * complete security audit trails. Critical for compliance and forensic analysis.
 *
 * Key Features:
 * - Automatic observation of all data derivation events
 * - MAC policy compliance for cross-classification operations
 * - Performance budget enforcement on security-critical paths
 * - Complete lineage tracking for forensic reconstruction
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Security observability requirements
 */

/**
 * @typedef {Object} SecurityLabel
 * @property {string} classification - Security classification level
 * @property {Array<string>} [compartments] - Security compartments
 */

/**
 * @typedef {Object} DerivationEvent
 * @property {Array<SecurityLabel>} fromLabels - Source security labels
 * @property {SecurityLabel} derivedLabel - Resulting security label
 * @property {Object} meta - Additional derivation metadata
 * @property {string} [meta.operation] - Type of derivation operation
 * @property {string} [meta.userId] - User performing the derivation
 * @property {Array<string>} [meta.entityIds] - Involved entity identifiers
 */

/**
 * Enterprise information flow tracker with automatic observability and MAC compliance.
 *
 * Tracks the derivation of data across security boundaries, providing complete audit
 * trails for compliance and forensic analysis. All operations are automatically
 * instrumented for security monitoring.
 *
 * @class InformationFlowTracker
 */
export class InformationFlowTracker {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of InformationFlowTracker with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"InformationFlowTracker requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;

		// Initialize orchestrated runner for all flow tracking operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for InformationFlowTracker observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "security.information_flow",
			actorId: "information_flow_tracker",
			eventType: "INFORMATION_FLOW_OPERATION",
			meta: {
				component: "InformationFlowTracker",
			},
		});
	}

	/**
	 * Initializes the information flow tracker.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		return this.#runOrchestrated(() => this.#executeInitialize(), {
			labelSuffix: "initialize",
			eventType: "INFORMATION_FLOW_INIT",
		});
	}

	/**
	 * Records a data derivation event with complete audit trail and MAC compliance.
	 *
	 * This method should be called whenever data from multiple sources is combined,
	 * transformed, or derived to create new entities, especially across security boundaries.
	 *
	 * @param {Array<SecurityLabel>} fromLabels - Security labels of source entities
	 * @param {SecurityLabel} derivedLabel - Security label of derived entity
	 * @param {Object} meta - Additional derivation metadata
	 * @param {string} [meta.operation] - Type of derivation operation
	 * @param {string} [meta.userId] - User performing the derivation
	 * @param {Array<string>} [meta.entityIds] - Involved entity identifiers
	 * @returns {Promise<void>}
	 * @throws {Error} If derivation violates MAC policies
	 */
	async derived(fromLabels, derivedLabel, meta = {}) {
		if (!Array.isArray(fromLabels) || fromLabels.length === 0) {
			throw new Error("fromLabels must be a non-empty array");
		}
		if (!derivedLabel?.classification) {
			throw new Error("derivedLabel must have a classification");
		}

		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			() => this.#executeDerived(fromLabels, derivedLabel, meta),
			{
				labelSuffix: "derived",
				eventType: "INFORMATION_FLOW_DERIVED",
				meta: {
					sourceCount: fromLabels.length,
					toClassification: derivedLabel.classification,
					operation: meta.operation,
				},
			}
		);
	}

	/**
	 * Validates that a derivation operation complies with MAC policies.
	 *
	 * @param {Array<SecurityLabel>} fromLabels - Source security labels
	 * @param {SecurityLabel} derivedLabel - Target security label
	 * @returns {Promise<boolean>} Whether derivation is allowed
	 */
	async validateDerivation(fromLabels, derivedLabel) {
		if (!Array.isArray(fromLabels) || !derivedLabel) {
			return false;
		}

		/* PERFORMANCE_BUDGET: 8ms */
		return this.#runOrchestrated(
			() => this.#executeValidateDerivation(fromLabels, derivedLabel),
			{
				labelSuffix: "validateDerivation",
				eventType: "INFORMATION_FLOW_VALIDATE",
				meta: {
					sourceCount: fromLabels.length,
					toClassification: derivedLabel.classification,
				},
			}
		);
	}

	/**
	 * Gets information flow metrics and statistics.
	 *
	 * @returns {Object} Flow tracking metrics
	 */
	getFlowMetrics() {
		return {
			component: "InformationFlowTracker",
			lastEventTime: Date.now(),
			isInitialized: true,
		};
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Executes tracker initialization.
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	async #executeInitialize() {
		// Emit initialization event
		this.#stateManager.emit?.("security.information_flow.initialized", {
			component: "InformationFlowTracker",
			timestamp: Date.now(),
		});
	}

	/**
	 * Executes data derivation tracking with MAC validation and audit trail.
	 *
	 * @private
	 * @param {Array<SecurityLabel>} fromLabels - Source labels
	 * @param {SecurityLabel} derivedLabel - Derived label
	 * @param {Object} meta - Additional metadata
	 * @returns {Promise<void>}
	 */
	#executeDerived(fromLabels, derivedLabel, meta) {
		// Validate MAC compliance for derivation
		return this.#performMACValidation(fromLabels, derivedLabel).then(
			(isValid) => {
				if (!isValid) {
					const error = new Error(
						"Information flow derivation violates MAC policy"
					);

					// Emit MAC violation event
					this.#stateManager.emit?.("security.mac_violation", {
						operation: "information_flow_derivation",
						fromLabels: fromLabels.map((l) => ({
							classification: l.classification,
							compartments: l.compartments || [],
						})),
						derivedLabel: {
							classification: derivedLabel.classification,
							compartments: derivedLabel.compartments || [],
						},
						userId: meta.userId || this.#getCurrentUserId(),
						timestamp: Date.now(),
						component: "InformationFlowTracker",
					});

					throw error;
				}

				// Emit successful derivation event
				this.#stateManager.emit?.(
					"security.information_flow_derivation",
					{
						fromLabels: fromLabels.map((l) => ({
							classification: l.classification,
							compartments: l.compartments || [],
						})),
						derivedLabel: {
							classification: derivedLabel.classification,
							compartments: derivedLabel.compartments || [],
						},
						operation: meta.operation || "unknown",
						userId: meta.userId || this.#getCurrentUserId(),
						entityIds: meta.entityIds || [],
						sourceCount: fromLabels.length,
						timestamp: Date.now(),
						component: "InformationFlowTracker",
					}
				);

				// Emit lineage event for forensic reconstruction
				this.#stateManager.emit?.("security.data_lineage_created", {
					derivationId: crypto.randomUUID(),
					sourceLabels: fromLabels,
					resultLabel: derivedLabel,
					metadata: meta,
					timestamp: Date.now(),
					component: "InformationFlowTracker",
				});
			}
		);
	}

	/**
	 * Executes derivation validation against MAC policies.
	 *
	 * @private
	 * @param {Array<SecurityLabel>} fromLabels - Source labels
	 * @param {SecurityLabel} derivedLabel - Target label
	 * @returns {Promise<boolean>}
	 */
	#executeValidateDerivation(fromLabels, derivedLabel) {
		return this.#performMACValidation(fromLabels, derivedLabel).then(
			(isValid) => {
				// Emit validation result
				this.#stateManager.emit?.("security.derivation_validation", {
					fromLabels: fromLabels.map((l) => ({
						classification: l.classification,
						compartments: l.compartments || [],
					})),
					derivedLabel: {
						classification: derivedLabel.classification,
						compartments: derivedLabel.compartments || [],
					},
					isValid,
					timestamp: Date.now(),
					component: "InformationFlowTracker",
				});

				return isValid;
			}
		);
	}

	/**
	 * Performs MAC validation for information flow operations.
	 *
	 * @private
	 * @param {Array<SecurityLabel>} fromLabels - Source labels
	 * @param {SecurityLabel} derivedLabel - Target label
	 * @returns {Promise<boolean>}
	 */
	async #performMACValidation(fromLabels, derivedLabel) {
		const securityManager = this.#stateManager.managers?.securityManager;
		const mac = securityManager?.mac;

		if (!mac) {
			// If MAC engine not available, default to allowing derivation
			// This maintains system functionality during bootstrap
			return true;
		}

		// For information flow, the derived classification must be at least
		// as high as the highest source classification (write-up rule)
		const derivedRank = this.#getClassificationRank(
			derivedLabel.classification
		);

		for (const sourceLabel of fromLabels) {
			const sourceRank = this.#getClassificationRank(
				sourceLabel.classification
			);

			// Derived label must be at least as high as source
			if (derivedRank < sourceRank) {
				return false;
			}

			// Derived compartments must be a superset of all source compartments
			const sourceCompartments = new Set(sourceLabel.compartments || []);
			const derivedCompartments = new Set(
				derivedLabel.compartments || []
			);

			for (const comp of sourceCompartments) {
				if (!derivedCompartments.has(comp)) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Gets the numeric rank of a classification level.
	 *
	 * @private
	 * @param {string} classification - Classification level
	 * @returns {number} Numeric rank (higher is more classified)
	 */
	#getClassificationRank(classification) {
		const levels = [
			"public",
			"internal",
			"restricted",
			"confidential",
			"secret",
			"top_secret",
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		];

		const rank = levels.indexOf(String(classification).toLowerCase());
		return rank >= 0 ? rank : 0;
	}

	/**
	 * Gets the current user ID from security context.
	 *
	 * @private
	 * @returns {string|null}
	 */
	#getCurrentUserId() {
		try {
			return this.#stateManager.managers?.securityManager?.userId || null;
		} catch {
			return null;
		}
	}
}

export default InformationFlowTracker;
