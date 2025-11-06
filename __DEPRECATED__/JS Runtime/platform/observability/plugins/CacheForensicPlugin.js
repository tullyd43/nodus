/**
 * @file CacheForensicPlugin.js
 * @description Forensic plugin for cache operations with MAC security and polyinstantiation support.
 * Provides comprehensive audit logging, security checks, and performance monitoring for cache reads/writes/deletes.
 */

import { BaseForensicPlugin } from "./BaseForensicPlugin.js";

/**
 * @class CacheForensicPlugin
 * @extends BaseForensicPlugin
 * @description Handles forensic instrumentation for cache operations including
 * polyinstantiation security checks, audit logging, and performance monitoring.
 */
export class CacheForensicPlugin extends BaseForensicPlugin {
	/**
	 * @param {import('../../state/HybridStateManager.js').default} stateManager
	 * @param {string[]} features - List of features enabled for this plugin instance.
	 */
	constructor(stateManager, features = []) {
		super(stateManager, "cache", features);
	}

	/**
	 * Classifies cache operations for security purposes.
	 * @param {string} operation - The cache operation (get, set, delete, clear).
	 * @returns {string} The classification level.
	 */
	classifyOperation(operation) {
		const classificationMap = {
			get: "CONFIDENTIAL", // Reading cached data
			set: "CONFIDENTIAL", // Writing cached data
			delete: "CONFIDENTIAL", // Removing cached data
			clear: "SECRET", // Clearing entire cache
			evict: "CONFIDENTIAL", // Evicting specific entries
		};
		return classificationMap[operation] || "UNCLASSIFIED";
	}

	/**
	 * Wraps cache operations with security checks, audit logging, and performance monitoring.
	 * @param {string} operation - The cache operation (get, set, delete).
	 * @param {Function} fn - The cache operation function.
	 * @param {object} context - Operation context including cache name, key, requester.
	 * @returns {Promise<any>} The result of the cache operation or null if denied.
	 */
	async wrapOperation(operation, fn, context = {}) {
		// Run the forensic wrapper via AsyncOrchestrator when available so
		// automatic observability (forensics/metrics/policy) is applied.
		const orchestrator = this._stateManager?.managers?.asyncOrchestrator;

		const runBody = () => {
			// Enhanced context with security metadata
			const enhancedContext = {
				...context,
				classification: this.classifyOperation(operation),
				timestamp: new Date().toISOString(),
				domain: "cache",
			};

			const proceed = () =>
				super.wrapOperation(
					operation,
					() =>
						Promise.resolve()
							.then(() => fn())
							.then((result) => {
								if (operation === "get") {
									if (
										result === null ||
										result === undefined
									) {
										enhancedContext.cacheResult = "miss";
										return result;
									}
									enhancedContext.cacheResult = "hit";

									if (result && result.meta?.securityLabel) {
										// Delegate to the security check helper (which is itself
										// orchestrated) and return its resolution promise.
										return this.#performSecurityChecks(
											result,
											context
										).then((securityResult) => {
											if (!securityResult.allowed) {
												this._log?.warn?.(
													`[CacheForensicPlugin] Post-read access denied`,
													{
														cache: context.cache,
														key: context.key,
														securityLabel:
															result.meta
																.securityLabel,
													}
												);
												return null;
											}
											return securityResult.filtered
												? securityResult.filteredData
												: result;
										});
									}
								}

								return result;
							}),
					enhancedContext
				);

			// Pre-operation security checks for reads
			if (operation === "get" && context.cacheValue) {
				return this.#performSecurityChecks(
					context.cacheValue,
					context
				).then((securityResult) => {
					if (!securityResult.allowed) {
						// Log security denial
						this._log?.warn?.(
							`[CacheForensicPlugin] Access denied: ${securityResult.reason}`,
							{
								operation,
								cache: context.cache,
								key: context.key,
								requester: context.requester,
								reason: securityResult.reason,
							}
						);

						// Use parent's wrapOperation for audit logging
						return super.wrapOperation(
							operation + "_denied",
							() => Promise.resolve(null),
							{
								...enhancedContext,
								securityDenial: securityResult.reason,
							}
						);
					}

					// Apply polyinstantiation filtering if needed
					if (securityResult.filtered) {
						enhancedContext.dataFiltered = true;
						context.cacheValue = securityResult.filteredData;
					}

					return proceed();
				});
			}

			return proceed();
		};

		const policies = this._stateManager.managers.policies;
		if (orchestrator?.createRunner) {
			if (!policies.getPolicy("async", "enabled")) {
				this._log?.warn?.(
					"[CacheForensicPlugin] Async operations disabled by policy; running inline."
				);
				return runBody();
			}

			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				`forensic.cache.${operation}`
			);
			/* PERFORMANCE_BUDGET: 5ms */
			return await runner.run(runBody);
		}

		return await runBody();
	}

	/**
	 * Performs MAC (Mandatory Access Control) security checks on cache data.
	 * @private
	 * @param {object} cacheValue - The cached data to check.
	 * @param {object} context - Request context including requester info.
	 * @returns {Promise<{allowed: boolean, reason?: string, filtered?: boolean, filteredData?: object}>}
	 */
	async #performSecurityChecks(cacheValue, context) {
		const orchestrator = this._stateManager?.managers?.asyncOrchestrator;

		const runCheck = () => {
			try {
				const securityManager =
					this._stateManager?.managers?.securityManager;

				// If no security manager or no security metadata, allow access
				if (!securityManager || !cacheValue?.meta?.securityLabel) {
					return Promise.resolve({ allowed: true });
				}

				// Get current user's security context
				const subject = securityManager.getSubject?.();
				if (!subject) {
					return Promise.resolve({
						allowed: false,
						reason: "no_security_context",
					});
				}

				// Check if user can read this data
				return Promise.resolve(
					securityManager.canRead?.(
						subject,
						cacheValue.meta.securityLabel
					)
				)
					.then((canRead) => {
						if (!canRead) {
							return {
								allowed: false,
								reason: "insufficient_clearance",
								securityLabel: cacheValue.meta.securityLabel,
								userClearance: subject.clearance,
							};
						}

						// Apply polyinstantiation filtering if needed
						if (
							cacheValue.meta.classification &&
							securityManager.filterByClassification
						) {
							const filteredData =
								securityManager.filterByClassification(
									cacheValue,
									subject.clearance
								);
							if (filteredData !== cacheValue) {
								return {
									allowed: true,
									filtered: true,
									filteredData,
								};
							}
						}

						return { allowed: true };
					})
					.catch((error) => {
						this._log?.error?.(
							`[CacheForensicPlugin] Security check failed`,
							{
								error: error.message,
								cache: context.cache,
								key: context.key,
								requester: context.requester,
							}
						);

						return {
							allowed: false,
							reason: "security_check_error",
						};
					});
			} catch (error) {
				this._log?.error?.(
					`[CacheForensicPlugin] Security check failed`,
					{
						error: error.message,
						cache: context.cache,
						key: context.key,
						requester: context.requester,
					}
				);

				return Promise.resolve({
					allowed: false,
					reason: "security_check_error",
				});
			}
		};

		const policies = this._stateManager.managers.policies;
		if (orchestrator?.createRunner) {
			if (!policies.getPolicy("async", "enabled")) {
				this._log?.warn?.(
					"[CacheForensicPlugin] Async operations disabled by policy; running inline."
				);
				return await runCheck();
			}

			/* PERFORMANCE_BUDGET: 2ms */
			const runner = orchestrator.createRunner(
				"forensic.cache.securityCheck"
			);
			/* PERFORMANCE_BUDGET: 2ms */
			return await runner.run(runCheck);
		}

		return await runCheck();
	}
}

export default CacheForensicPlugin;
