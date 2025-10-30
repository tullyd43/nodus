// modules/key-rotation.js
// Key rotation module for forward secrecy and compliance

/**
 * @description
 * Manages the automatic and manual rotation of cryptographic keys to enhance security.
 * This module works in conjunction with a crypto instance (like `AESCrypto`) to ensure
 * keys are periodically updated, adhering to security best practices like forward secrecy.
 * It supports scheduled rotations, emergency rotations, and maintains a history of key versions.
 *
 * @module KeyRotation
 */
export default class KeyRotation {
	/**
	 * @private
	 * @type {import('./aes-crypto.js').default}
	 */
	#cryptoInstance;
	/**
	 * @private
	 * @type {object|null}
	 */
	#rotationSchedule;
	/**
	 * @private
	 * @type {Map<number, object>}
	 */
	#keyHistory = new Map();
	/**
	 * @private
	 * @type {Function[]}
	 */
	#rotationCallbacks = [];
	/**
	 * @private
	 * @type {{rotationCount: number, lastRotation: number|null, averageRotationTime: number, rotationTimes: number[]}}
	 */
	#metrics = {
		rotationCount: 0,
		lastRotation: null,
		averageRotationTime: 0,
		rotationTimes: [],
	};

	/**
	 * Creates an instance of KeyRotation.
	 * @param {import('./aes-crypto.js').default} cryptoInstance - The crypto module instance whose keys will be rotated.
	 * @param {object} [options={}] - Configuration options for key rotation.
	 * @param {number} [options.rotationInterval=14400000] - The interval for automatic rotation in milliseconds (default: 4 hours).
	 * @param {boolean} [options.autoRotate=true] - Whether to enable automatic key rotation.
	 */
	constructor(cryptoInstance, options = {}) {
		this.#cryptoInstance = cryptoInstance;

		this.options = {
			rotationInterval: options.rotationInterval || 4 * 3600000, // 4 hours
			keyHistoryLimit: options.keyHistoryLimit || 10,
			autoRotate: options.autoRotate !== false,
			rotationJitter: options.rotationJitter || 0.1, // 10% jitter
			...options,
		};

		console.log("[KeyRotation] Loaded for crypto key management");
	}

	/**
	 * Initializes the key rotation module and schedules the first rotation if auto-rotate is enabled.
	 * @param {import('./aes-crypto.js').default} [cryptoInstance] - An optional crypto instance to bind to.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init(cryptoInstance) {
		if (cryptoInstance) {
			this.#cryptoInstance = cryptoInstance;
		}

		if (this.options.autoRotate) {
			this.#scheduleNextRotation();
		}

		console.log("[KeyRotation] Key rotation initialized");
		return this;
	}

	/**
	 * Manually triggers a key rotation.
	 * This process involves telling the crypto instance to generate a new key, updating history and metrics, and notifying listeners.
	 * @returns {Promise<{oldVersion: number, newVersion: number, rotationTime: number}>} A promise that resolves with details about the rotation.
	 */
	async rotateKeys() {
		const startTime = performance.now();

		try {
			console.log("[KeyRotation] Starting key rotation...");

			// Store current key version for history
			const oldVersion = this.#cryptoInstance.getVersion();

			// Trigger rotation in crypto instance
			await this.#cryptoInstance.rotateKeys();

			const newVersion = this.#cryptoInstance.getVersion();

			// Record in history
			this.#keyHistory.set(oldVersion, {
				rotatedAt: Date.now(),
				rotatedTo: newVersion,
				reason: "scheduled",
			});

			// Cleanup old history
			this.#cleanupKeyHistory();

			// Update metrics
			const rotationTime = performance.now() - startTime;
			this.#updateRotationMetrics(rotationTime);

			// Notify callbacks
			await this.#notifyRotationCallbacks(oldVersion, newVersion);

			console.log(
				`[KeyRotation] Key rotation complete: v${oldVersion} → v${newVersion} (${rotationTime.toFixed(2)}ms)`
			);

			// Schedule next rotation
			if (this.options.autoRotate) {
				this.#scheduleNextRotation();
			}

			return { oldVersion, newVersion, rotationTime };
		} catch (error) {
			console.error("[KeyRotation] Key rotation failed:", error);
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
		console.warn(`[KeyRotation] Emergency rotation triggered: ${reason}`);

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
		this.#keyHistory.clear();
		console.log("[KeyRotation] Keys destroyed, rotation stopped");
	}

	/**
	 * Retrieves performance and state metrics for the key rotation process.
	 * @returns {object} An object containing various metrics.
	 */
	getRotationMetrics() {
		return {
			...this.#metrics,
			nextRotationAt: this.#rotationSchedule?.scheduledTime || null,
			keyHistoryCount: this.#keyHistory.size,
			isAutoRotating: this.options.autoRotate,
		};
	}

	/**
	 * Retrieves the history of key rotations.
	 * @returns {Array<{version: number, rotatedAt: number, rotatedTo: number, reason: string}>} An array of key history records.
	 */
	getKeyHistory() {
		return Array.from(this.#keyHistory.entries()).map(
			([version, info]) => ({
				version,
				...info,
			})
		);
	}

	/**
	 * Checks if a key rotation is due based on the configured interval.
	 * @returns {boolean} True if a rotation is due.
	 */
	isRotationDue() {
		if (!this.#metrics.lastRotation) return true;

		const timeSinceLastRotation = Date.now() - this.#metrics.lastRotation;
		return timeSinceLastRotation >= this.options.rotationInterval;
	}

	/**
	 * Updates the automatic rotation interval.
	 * @param {number} interval - The new rotation interval in milliseconds.
	 */
	updateRotationInterval(interval) {
		const oldInterval = this.options.rotationInterval;
		this.options.rotationInterval = interval;

		// Reschedule if auto-rotating
		if (this.options.autoRotate) {
			this.#cancelScheduledRotation();
			this.#scheduleNextRotation();
		}

		console.log(
			`[KeyRotation] Rotation interval updated: ${oldInterval}ms → ${interval}ms`
		);
	}

	/**
	 * Enables or disables the automatic key rotation feature.
	 * @param {boolean} enabled - True to enable, false to disable.
	 */
	setAutoRotation(enabled) {
		this.options.autoRotate = enabled;

		if (enabled) {
			this.#scheduleNextRotation();
		} else {
			this.#cancelScheduledRotation();
		}

		console.log(
			`[KeyRotation] Auto rotation ${enabled ? "enabled" : "disabled"}`
		);
	}

	/**
	 * Cleans up resources and stops the rotation schedule.
	 */
	destroy() {
		this.#cancelScheduledRotation();
		this.#keyHistory.clear();
		this.#rotationCallbacks = [];
		console.log("[KeyRotation] Key rotation destroyed");
	}

	// Private methods
	#scheduleNextRotation() {
		this.#cancelScheduledRotation();

		// Add jitter to prevent synchronized rotations
		const jitter =
			this.options.rotationInterval * this.options.rotationJitter;
		const jitterAmount = (Math.random() - 0.5) * 2 * jitter;
		const rotationTime = this.options.rotationInterval + jitterAmount;

		this.#rotationSchedule = {
			timeout: setTimeout(() => {
				this.rotateKeys().catch((error) => {
					console.error(
						"[KeyRotation] Scheduled rotation failed:",
						error
					);
					// Retry in 5 minutes
					setTimeout(
						() => this.#scheduleNextRotation(),
						5 * 60 * 1000
					);
				});
			}, rotationTime),
			scheduledTime: Date.now() + rotationTime,
		};

		console.log(
			`[KeyRotation] Next rotation scheduled in ${Math.round(rotationTime / 1000 / 60)} minutes`
		);
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
	 * Cleans up the key history log to stay within the configured limit.
	 * @private
	 */
	#cleanupKeyHistory() {
		if (this.#keyHistory.size <= this.options.keyHistoryLimit) return;

		// Remove oldest entries
		const entries = Array.from(this.#keyHistory.entries());
		entries.sort((a, b) => a[1].rotatedAt - b[1].rotatedAt);

		const toRemove = entries.slice(
			0,
			entries.length - this.options.keyHistoryLimit
		);
		for (const [version] of toRemove) {
			this.#keyHistory.delete(version);
		}
	}

	/**
	 * Updates the internal metrics after a key rotation.
	 * @private
	 * @param {number} rotationTime - The time taken for the rotation in milliseconds.
	 */
	#updateRotationMetrics(rotationTime) {
		this.#metrics.rotationCount++;
		this.#metrics.lastRotation = Date.now();
		this.#metrics.rotationTimes.push(rotationTime);

		// Keep only recent rotation times
		if (this.#metrics.rotationTimes.length > 50) {
			this.#metrics.rotationTimes =
				this.#metrics.rotationTimes.slice(-25);
		}

		// Calculate average
		this.#metrics.averageRotationTime =
			this.#metrics.rotationTimes.reduce((a, b) => a + b, 0) /
			this.#metrics.rotationTimes.length;
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
				console.error("[KeyRotation] Callback error:", error);
			}
		});

		await Promise.allSettled(promises);
	}
}
