// modules/key-rotation.js
// Key rotation module for forward secrecy and compliance
import { AppError } from "../../../utils/ErrorHelpers.js";

/**
 * @description
 * Manages the automatic and manual rotation of cryptographic keys to enhance security.
 * This module works in conjunction with a crypto instance (like `AESCrypto`) to ensure
 * keys are periodically updated, adhering to security best practices like forward secrecy.
 * It supports scheduled rotations, emergency rotations, and maintains a history of key versions.
 *
 * @module KeyRotation
 * @privateFields {#cryptoProvider, #rotationSchedule, #keyHistory, #rotationCallbacks, #stateManager, #metrics, #options, #forensicLogger, #errorHelpers}
 */
export default class KeyRotation {
	/** @private @type {import('./aes-crypto.js').default|null} */
	#cryptoProvider = null;
	/** @private @type {object|null} */
	#rotationSchedule = null;
	/**
	 * @private
	 * @description V8.0 Parity: Mandate 4.1 - Use a bounded cache for key history.
	 * @type {import('../../../utils/LRUCache.js').LRUCache|null}
	 */
	#keyHistory = null;
	/** @private @type {Function[]} */
	#rotationCallbacks = [];
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {object} */
	#options;

	/**
	 * Creates an instance of KeyRotation.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for key rotation.
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
	}

	/**
	 * Initializes the key rotation module and schedules the first rotation if auto-rotate is enabled.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
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
		this.#keyHistory = this.#stateManager?.managers?.cacheManager?.getCache(
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
	}

	/**
	 * Manually triggers a key rotation.
	 * This process involves telling the crypto instance to generate a new key, updating history and metrics, and notifying listeners.
	 * @returns {Promise<{oldVersion: number, newVersion: number, rotationTime: number}>} A promise that resolves with details about the rotation.
	 */
	async rotateKeys() {
		const startTime = performance.now();

		if (!this.#cryptoProvider) {
			throw new AppError("Crypto provider is not set.", {
				category: "system_error",
			});
		}

		try {
			this.#audit("rotation_start", {});

			// Store current key version for history
			const oldVersion = this.#cryptoProvider.getVersion();

			// Trigger rotation in crypto instance
			const { newVersion } = await this.#cryptoProvider.rotateKeys();

			// Record in history
			this.#keyHistory.set(oldVersion, {
				rotatedAt: Date.now(),
				rotatedTo: newVersion,
				reason: "scheduled",
			});

			// Update metrics
			const rotationTime = performance.now() - startTime;
			this.#updateRotationMetrics(rotationTime);

			// Notify callbacks
			await this.#notifyRotationCallbacks(oldVersion, newVersion);

			this.#audit("rotation_complete", {
				oldVersion,
				newVersion,
				duration: rotationTime,
			});

			// Schedule next rotation
			if (this.#options.autoRotate) {
				this.#scheduleNextRotation();
			}

			return { oldVersion, newVersion, rotationTime };
		} catch (error) {
			this.#audit("rotation_failed", { error: error.message });
			this.#errorHelpers?.handleError(
				new AppError("Key rotation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Triggers an immediate, emergency key rotation.
	 * This is used in response to a suspected security incident.
	 * @param {string} [reason='security_incident'] - The reason for the emergency rotation, for auditing purposes.
	 * @returns {Promise<object>} The result of the rotation.
	 */
	async emergencyRotation(reason = "security_incident") {
		this.#audit("emergency_rotation_start", { reason });

		// Cancel scheduled rotation
		this.#cancelScheduledRotation();

		// Perform immediate rotation
		const result = await this.rotateKeys();

		// Record emergency reason
		this.#keyHistory.set(result.oldVersion, {
			...this.#keyHistory.get(result.oldVersion),
			reason: `emergency:${reason}`,
			emergency: true,
		});

		return result;
	}

	/**
	 * Registers a callback function to be executed after a key rotation occurs.
	 * @param {Function} callback - The callback function, which will receive `(oldVersion, newVersion)`.
	 */
	onKeyRotation(callback) {
		this.#rotationCallbacks.push(callback);
	}

	/**
	 * A lifecycle method called when the associated crypto instance is destroying its keys.
	 * This cancels any scheduled rotations.
	 * @returns {Promise<void>}
	 */
	async onKeysDestroyed() {
		this.#cancelScheduledRotation();
		this.#keyHistory?.clear();
		this.#audit("keys_destroyed", {
			reason: "Crypto provider keys destroyed.",
		});
	}

	/**
	 * Retrieves performance and state metrics for the key rotation process.
	 * @returns {object} An object containing various metrics.
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
	 * @returns {Array<{version: number, rotatedAt: number, rotatedTo: number, reason: string}>} An array of key history records.
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
	 */
	updateRotationInterval(interval) {
		this.#options.rotationInterval = interval;

		// Reschedule if auto-rotating
		if (this.#options.autoRotate) {
			this.#cancelScheduledRotation();
			this.#scheduleNextRotation();
		}
	}

	/**
	 * Enables or disables the automatic key rotation feature.
	 * @param {boolean} enabled - True to enable, false to disable.
	 */
	setAutoRotation(enabled) {
		this.#options.autoRotate = enabled;

		if (enabled) {
			this.#scheduleNextRotation();
		} else {
			this.#cancelScheduledRotation();
		}
	}

	/**
	 * Cleans up resources and stops the rotation schedule.
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
	 * @param {object} cryptoProvider - The crypto provider instance.
	 */
	setCryptoProvider(cryptoProvider) {
		if (cryptoProvider && typeof cryptoProvider.rotateKeys === "function") {
			this.#cryptoProvider = cryptoProvider;
		}
	}

	// Private methods
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
	 * Cancels any pending scheduled key rotation.
	 * @private
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
	 */
	#updateRotationMetrics(rotationTime) {
		this.#metrics?.increment("rotationCount");
		this.#metrics?.set("lastRotation", Date.now());
		this.#metrics?.updateAverage("averageRotationTime", rotationTime);
	}

	/**
	 * Notifies all registered callback listeners that a key rotation has occurred.
	 * @private
	 * @param {number} oldVersion - The previous key version.
	 * @param {number} newVersion - The new key version.
	 */
	async #notifyRotationCallbacks(oldVersion, newVersion) {
		const promises = this.#rotationCallbacks.map(async (callback) => {
			try {
				await callback(oldVersion, newVersion);
			} catch (error) {
				this.#errorHelpers?.handleError(
					new AppError("Key rotation callback failed", {
						cause: error,
					})
				);
			}
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'rotation_start').
	 * @param {object} data - The data associated with the event.
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
