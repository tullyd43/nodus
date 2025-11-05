import { ClassificationCrypto } from "@platform/security/ClassificationCrypto.js";

/**
 * @class PluginSignatureValidator
 * @description Validates cryptographic signatures on enterprise forensic plugins.
 * Prevents unauthorized or community plugins from being loaded in enterprise mode.
 */
export class PluginSignatureValidator {
	/** @private @type {string} */
	#publicKey;
	/** @private @type {boolean} */
	#requireSigned;
	/** @private @type {import('../../shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;

	constructor(enterpriseLicense = {}, orchestrator = null) {
		this.#publicKey = enterpriseLicense?.pluginValidation?.publicKey;
		this.#requireSigned =
			enterpriseLicense?.features?.requireSignedPlugins || false;
		this.#orchestrator = orchestrator || null;
	}

	/**
	 * Validates that a plugin is signed by Nodus Enterprise.
	 * @param {object} plugin - The plugin to validate
	 * @param {string} pluginSignature - The plugin's cryptographic signature
	 * @returns {Promise<boolean>} Whether the plugin is valid for enterprise use
	 */
	validatePlugin(plugin, pluginSignature) {
		const run = () => {
			if (!this.#requireSigned) {
				console.warn(
					"[PluginValidator] Plugin signing not required for this license."
				);
				return Promise.resolve(true);
			}

			if (!pluginSignature) {
				console.error(
					"[PluginValidator] Enterprise plugin missing required signature."
				);
				return Promise.resolve(false);
			}

			return this.#hashPlugin(plugin)
				.then((pluginHash) =>
					ClassificationCrypto.verifySignature(
						pluginHash,
						pluginSignature,
						this.#publicKey
					)
				)
				.then((isValid) => {
					if (isValid) {
						console.warn(
							"[PluginValidator] Enterprise plugin signature verified."
						);
						return true;
					}
					console.error(
						"[PluginValidator] Invalid plugin signature detected."
					);
					return false;
				})
				.catch((error) => {
					console.error(
						"[PluginValidator] Plugin validation failed:",
						error
					);
					return false;
				});
		};

		// If an orchestrator is provided, run validation under it for observability
		if (this.#orchestrator?.run) {
			/* PERFORMANCE_BUDGET: 20ms */
			return this.#orchestrator.run(run, {
				component: "PluginSignatureValidator",
				operation: "validatePlugin",
			});
		}

		// Fallback: run inline
		return run();
	}

	/**
	 * Creates a cryptographic hash of the plugin for signature verification.
	 * @private
	 * @param {object} plugin - The plugin to hash
	 * @returns {Promise<string>} The plugin hash
	 */
	#hashPlugin(plugin) {
		// A more robust implementation would stringify the plugin's source code.
		// For now, we'll use metadata as defined in the plan.
		const pluginString = JSON.stringify({
			name: plugin.constructor.name,
			version: plugin.version || "0.0.0",
			methods: Object.getOwnPropertyNames(plugin.constructor.prototype),
			checksum: plugin.checksum, // Assuming a build-time checksum is available
		});

		// ClassificationCrypto.hash returns a Promise; return it directly so callers can await.
		return ClassificationCrypto.hash(pluginString);
	}
}
