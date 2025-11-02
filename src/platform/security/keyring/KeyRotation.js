// modules/key-rotation.js
// Key rotation module for forward secrecy and compliance
import { AppError } from "@utils/ErrorHelpers.js";

/**
 * @typedef {object} KeyRotationOptions
 * @property {number} [rotationInterval=14400000] Interval between automatic rotations in milliseconds.
 * @property {number} [keyHistoryLimit=10] Maximum number of rotation entries retained in history.
 * @property {boolean} [autoRotate=true] Enables automatic scheduling of rotations when true.
 * @property {number} [rotationJitter=0.1] Jitter factor applied to rotation scheduling to avoid synchronization.
 */

/**
 * @typedef {object} KeyRotationContext
 * @property {import("../../HybridStateManager.js").default} stateManager Shared application state manager.
 * @property {KeyRotationOptions} [options] Configuration overrides for the key rotation module.
 */

/**
 * @typedef {object} KeyRotationSchedule
 * @property {ReturnType<typeof setTimeout>} timeout Active timeout identifier for the scheduled rotation.
 * @property {number} scheduledTime Epoch timestamp (in ms) when the next rotation is expected to run.
 */

/**
 * @typedef {object} KeyHistoryEntry
 * @property {number} rotatedAt Epoch timestamp (in ms) when the rotation completed.
 * @property {number} rotatedTo Version identifier that replaced the previous key.
 * @property {string} reason Canonical reason string describing why the rotation happened.
 * @property {boolean} [emergency] Marks the rotation as an emergency flow when true.
 */

/**
 * @typedef {object} RotationResult
 * @property {number} oldVersion Version number that was active prior to rotation.
 * @property {number} newVersion Version number that became active after rotation.
 * @property {number} rotationTime Duration (in ms) the rotation took to execute.
 */

/**
 * @typedef {object} RotationMetrics
 * @property {number|null} nextRotationAt Scheduled epoch timestamp for the next rotation, if any.
 * @property {number} keyHistoryCount Total entries currently stored in history.
 * @property {boolean} isAutoRotating Indicates whether automatic rotation is enabled.
 * @property {unknown} [rotationCount] Raw metric for total rotations, if the registry provides it.
 * @property {unknown} [lastRotation] Raw metric describing the last rotation timestamp, if present.
 * @property {unknown} [averageRotationTime] Raw metric capturing average rotation time, if present.
 */

/**
 * @callback KeyRotationListener
 * @param {number} oldVersion Version number before rotation.
 * @param {number} newVersion Version number after rotation.
 * @returns {void|Promise<void>}
 */

/**
 * @description
 * Manages the automatic and manual rotation of cryptographic keys to enhance security.
 * This module works in conjunction with a crypto instance (like `AESCrypto`) to ensure
 * keys are periodically updated, adhering to security best practices like forward secrecy.
 * It supports scheduled rotations, emergency rotations, and maintains a history of key versions.
 *
 * @module KeyRotation
 * @privateFields {#cryptoProvider, #rotationSchedule, #keyHistory, #rotationCallbacks, #stateManager, #metrics, #options, #forensicLogger, #errorHelpers, #asyncService}
 */
export default class KeyRotation {
	/** @private @type {import('./aes-crypto.js').default|null} */
	#cryptoProvider = null;
	/** @private @type {KeyRotationSchedule|null} */
	#rotationSchedule = null;
	/**
	 * @private
	 * @description V8.0 Parity: Mandate 4.1 - Use a bounded cache for key history.
	 * @type {import('../../../utils/LRUCache.js').LRUCache<number, KeyHistoryEntry>|null}
	 */
	#keyHistory = null;
	/** @private @type {KeyRotationListener[]} */
	#rotationCallbacks = [];
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {KeyRotationOptions} */
	#options;
	/** @private @type {ReturnType<import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService["createRunner"]>} */
	#run;
	/** @private @type {import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService|null} */
	#asyncService = null;

	/**
	 * Creates an instance of KeyRotation.
	 * @param {KeyRotationContext} context The application context.
	 */

	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("keyRotation");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;

		this.#options = {
			rotationInterval: options.rotationInterval || 4 * 3600000, // 4 hours
			keyHistoryLimit: options.keyHistoryLimit || 10,
			autoRotate: options.autoRotate !== false,
			rotationJitter: options.rotationJitter || 0.1, // 10% jitter
			...options,
		};

		this.#asyncService =
			this.#stateManager?.managers?.asyncOrchestrator ?? null;
		if (!this.#asyncService) {
			throw new AppError(
				"AsyncOrchestrationService is required for KeyRotation.",
				{ category: "configuration_error" }
			);
		}

		this.#run = this.#asyncService.createRunner({
			labelPrefix: "security.keyRotation",
			actorId: "key.rotation",
			eventType: "SECURITY_KEY_ROTATION",
			meta: { component: "KeyRotation" },
		});
	}

	/**
	 * Initializes the key rotation module and schedules the first rotation if auto-rotate is enabled.
	 * @returns {Promise<this>} The initialized instance.
	 * @throws {AppError} Thrown when a crypto provider has not been assigned.
	 */
		init() {
			return this.#run(
				() => {
					// V8.0 Parity: The crypto provider is set by the parent crypto module after construction.
					if (!this.#cryptoProvider) {
						const errorMessage =
							"KeyRotation cannot be initialized without a crypto provider. It must be set via setCryptoProvider().";
						this.#audit("init_failed", { error: errorMessage });
						throw new AppError(errorMessage, {
							category: "configuration_error",
						});
					}

					// V8.0 Parity: Mandate 4.1 - Obtain a bounded cache from the central CacheManager.
					this.#keyHistory =
						this.#stateManager?.managers?.cacheManager?.getCache(
							"keyRotationHistory",
							{
								max: this.#options.keyHistoryLimit,
							}
						);
					if (this.#options.autoRotate) {
						this.#scheduleNextRotation();
					}

					this.#audit("init", { autoRotate: this.#options.autoRotate });
					return this;
				},
				{
					labelSuffix: "init",
					eventType: "SECURITY_KEY_ROTATION_INIT",
					meta: { autoRotate: this.#options.autoRotate },
				}
			);
		}

	/**
	 * Manually triggers a key rotation.
	 * This process involves telling the crypto instance to generate a new key, updating history and metrics, and notifying listeners.
	 * @returns {Promise<RotationResult>} A promise that resolves with details about the rotation.
	 * @throws {AppError|Error} Throws when the crypto provider is missing or the underlying rotation fails.
	 */
		rotateKeys() {
			return this.#run(
				() =>
					this.#performRotation({
						reason: "scheduled",
						emergency: false,
				}),
			{
				labelSuffix: "rotateKeys",
				eventType: "SECURITY_KEY_ROTATION_EXECUTE",
				meta: { reason: "scheduled" },
			}
		);
	}

	/**
	 * Triggers an immediate, emergency key rotation.
	 * This is used in response to a suspected security incident.
	 * @param {string} [reason='security_incident'] - The reason for the emergency rotation, for auditing purposes.
	 * @returns {Promise<RotationResult>} The result of the rotation.
	 */
		emergencyRotation(reason = "security_incident") {
			return this.#run(
				() => {
					this.#audit("emergency_rotation_start", { reason });

					// Cancel scheduled rotation
					this.#cancelScheduledRotation();

					return this.#performRotation({
						reason: `emergency:${reason}`,
						emergency: true,
					});
				},
				{
					labelSuffix: "emergencyRotation",
					eventType: "SECURITY_KEY_ROTATION_EMERGENCY",
					meta: { reason },
				}
			);
		}

	/**
	 * Registers a callback function to be executed after a key rotation occurs.
	 * @param {KeyRotationListener} callback - The callback function, which will receive `(oldVersion, newVersion)`.
	 * @returns {void}
	 */
	onKeyRotation(callback) {
		this.#rotationCallbacks.push(callback);
	}

	/**
	 * A lifecycle method called when the associated crypto instance is destroying its keys.
	 * This cancels any scheduled rotations.
	 * @returns {Promise<void>}
	 */
		onKeysDestroyed() {
			return this.#run(
				() => {
					this.#cancelScheduledRotation();
					this.#keyHistory?.clear();
					this.#audit("keys_destroyed", {
						reason: "Crypto provider keys destroyed.",
					});
				},
				{
					labelSuffix: "onKeysDestroyed",
					eventType: "SECURITY_KEY_ROTATION_DESTROYED",
				}
			);
		}

	/**
	 * Retrieves performance and state metrics for the key rotation process.
	 * @returns {RotationMetrics} An object containing various metrics.
	 */
	getRotationMetrics() {
		return {
			...this.#metrics?.getAllAsObject(),
			nextRotationAt: this.#rotationSchedule?.scheduledTime || null,
			keyHistoryCount: this.#keyHistory?.size || 0,
			isAutoRotating: this.#options.autoRotate,
		};
	}

	/**
	 * Retrieves the history of key rotations.
	 * @returns {Array<KeyHistoryEntry & {version: number}>} An array of key history records.
	 */
	getKeyHistory() {
		if (!this.#keyHistory) return [];
		return this.#keyHistory.dump().map(([version, info]) => ({
			version: Number(version),
			...info,
		}));
	}

	/**
	 * Checks if a key rotation is due based on the configured interval.
	 * @returns {boolean} True if a rotation is due.
	 */
	isRotationDue() {
		if (!this.#metrics?.get("lastRotation")) return true;

		const timeSinceLastRotation =
			Date.now() - this.#metrics.get("lastRotation").value;
		return timeSinceLastRotation >= this.#options.rotationInterval;
	}

	/**
	 * Updates the automatic rotation interval.
	 * @param {number} interval - The new rotation interval in milliseconds.
	 * @returns {void}
	 */
	updateRotationInterval(interval) {
		return this.#run(
			() => {
				this.#options.rotationInterval = interval;

				if (this.#options.autoRotate) {
					this.#cancelScheduledRotation();
					this.#scheduleNextRotation();
				}
				// Also log with the instance logger for persistence
				try {
					this.#forensicLogger?.logAuditEvent(
						"KEY_ROTATION_INTERVAL_UPDATED",
						{ newInterval: interval }
					);
				} catch {
					/* noop */
				}
			},
			{
				labelSuffix: "updateInterval",
				eventType: "SECURITY_KEY_ROTATION_UPDATE_INTERVAL",
				meta: { newInterval: interval },
			}
		);
	}

	/**
	 * Enables or disables the automatic key rotation feature.
	 * @param {boolean} enabled - True to enable, false to disable.
	 * @returns {void}
	 */
	setAutoRotation(enabled) {
		return this.#run(
			() => {
				this.#options.autoRotate = enabled;

				if (enabled) {
					this.#scheduleNextRotation();
				} else {
					this.#cancelScheduledRotation();
				}

				this.#audit("auto_rotation_updated", { enabled });
			},
			{
				labelSuffix: "setAutoRotation",
				eventType: "SECURITY_KEY_ROTATION_AUTO_ROTATION",
				meta: { enabled },
			}
		);
	}

	/**
	 * Cleans up resources and stops the rotation schedule.
	 * @returns {void}
	 */
	destroy() {
		this.#cancelScheduledRotation();
		this.#audit("destroy", {});
		this.#keyHistory?.clear();
		this.#rotationCallbacks = [];
	}

	/**
	 * Sets the primary crypto provider instance that this module will manage.
	 * This is called by the parent crypto module (e.g., AESCrypto) during its initialization.
	 * @param {import('./aes-crypto.js').default} cryptoProvider - The crypto provider instance.
	 * @returns {void}
	 */
	setCryptoProvider(cryptoProvider) {
		if (cryptoProvider && typeof cryptoProvider.rotateKeys === "function") {
			this.#cryptoProvider = cryptoProvider;
		}
	}

	// Private methods
	/**
	 * Schedules the next key rotation using the configured interval and jitter to avoid synchronization.
	 * @private
	 * @returns {void}
	 */
	#scheduleNextRotation() {
		this.#cancelScheduledRotation();

		// Add jitter to prevent synchronized rotations
		const jitter =
			this.#options.rotationInterval * this.#options.rotationJitter;
		const jitterAmount = (Math.random() - 0.5) * 2 * jitter;
		const rotationTime = this.#options.rotationInterval + jitterAmount;

		this.#rotationSchedule = {
			timeout: setTimeout(() => {
				this.rotateKeys().catch(() => {
					// Error is already handled and logged by rotateKeys()
					// Retry in 5 minutes
					setTimeout(
						() => this.#scheduleNextRotation(),
						5 * 60 * 1000
					);
				});
			}, rotationTime),
			scheduledTime: Date.now() + rotationTime,
		};
	}

	/**
	 * Performs the core rotation workflow without additional orchestration metadata.
	 * @private
	 * @param {{ reason: string, emergency: boolean }} options
	 * @returns {Promise<RotationResult>}
	 */
	#performRotation({ reason, emergency }) {
		const startTime = performance.now();

		if (!this.#cryptoProvider) {
			throw new AppError("Crypto provider is not set.", {
				category: "system_error",
			});
		}

		this.#audit("rotation_start", { reason, emergency });

		const oldVersion = this.#cryptoProvider.getVersion();

		return this.#cryptoProvider
			.rotateKeys()
			.then(({ newVersion }) => {
				const historyEntry = {
					rotatedAt: Date.now(),
					rotatedTo: newVersion,
					reason,
				};
				if (emergency) {
					historyEntry.emergency = true;
				}
				this.#keyHistory?.set(oldVersion, historyEntry);

				const rotationTime = performance.now() - startTime;
				this.#recordRotationMetrics(rotationTime);

				return this.#notifyRotationCallbacks(oldVersion, newVersion)
					.then(() => {
						this.#audit("rotation_complete", {
							oldVersion,
							newVersion,
							duration: rotationTime,
							reason,
							emergency,
						});

						if (this.#options.autoRotate) {
							this.#scheduleNextRotation();
						}

						return { oldVersion, newVersion, rotationTime };
					});
			})
			.catch((error) => {
				this.#audit("rotation_failed", {
					error: error.message,
					reason,
				});
				this.#errorHelpers?.handleError(
					new AppError("Key rotation failed", { cause: error })
				);
				throw error;
			});
	}

	/**
	 * Cancels any pending scheduled key rotation.
	 * @private
	 * @returns {void}
	 */
	#cancelScheduledRotation() {
		if (this.#rotationSchedule?.timeout) {
			clearTimeout(this.#rotationSchedule.timeout);
			this.#rotationSchedule = null;
		}
	}

	/**
	 * Updates the internal metrics after a key rotation.
	 * @private
	 * @param {number} rotationTime - The time taken for the rotation in milliseconds.
	 * @returns {void}
	 */
	#recordRotationMetrics(rotationTime) {
		this.#metrics?.increment("rotationCount");
		this.#metrics?.set("lastRotation", Date.now());
		this.#metrics?.updateAverage("averageRotationTime", rotationTime);
	}

	/**
	 * Notifies all registered callback listeners that a key rotation has occurred.
	 * @private
	 * @param {number} oldVersion - The previous key version.
	 * @param {number} newVersion - The new key version.
	 * @returns {Promise<void>}
	 */
	#notifyRotationCallbacks(oldVersion, newVersion) {
		const operations = this.#rotationCallbacks.map((callback) => {
			try {
				const maybePromise = callback(oldVersion, newVersion);
				return Promise.resolve(maybePromise);
			} catch (error) {
				this.#errorHelpers?.handleError(
					new AppError("Key rotation callback failed", {
						cause: error,
					})
				);
				return Promise.resolve();
			}
		});

		return Promise.allSettled(operations).then(() => undefined);
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'rotation_start').
	 * @param {object} data - The data associated with the event.
	 * @returns {void}
	 */
	#audit(eventType, data) {
		if (this.#forensicLogger) {
			this.#forensicLogger.logAuditEvent(
				`KEY_ROTATION_${eventType.toUpperCase()}`,
				data
			);
		}
	}
}
