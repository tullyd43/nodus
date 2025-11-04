/**
 * PolicyEngineAdapter.js
 * -----------------------------------------------------------------------------
 * Lightweight bridge between runtime instrumentation layers (AsyncOrchestrator,
 * ActionDispatcher, ForensicPlugin, etc.) and the SystemPolicies manager.
 *
 * Provides both async and synchronous policy lookups to determine whether
 * instrumentation, metrics, and forensic logging should occur in a given
 * context. The adapter is intentionally small and defensive: it falls back to
 * safe defaults and keeps an internal cache for sync fast-paths.
 * -----------------------------------------------------------------------------
 */

/* eslint-disable nodus/require-action-dispatcher, nodus/require-observability-compliance -- internal policy adapter uses in-memory cache and does not perform state mutations */

export class PolicyEngineAdapter {
	/**
	 * @param {object} policyManager - The SystemPolicies manager (expected to expose getPolicy / getPolicySync)
	 * @param {object} [options]
	 * @param {boolean} [options.cacheResults=true]
	 */
	constructor(
		policyManager,
		{ cacheResults = true, stateManager = null } = {}
	) {
		if (!policyManager)
			throw new Error("PolicyEngineAdapter requires a policyManager");
		this.policyManager = policyManager;
		this.cacheResults = Boolean(cacheResults);
		// Small bounded cache to avoid unbounded memory growth in long-lived
		// processes. This is an internal, in-memory cache (not application
		// state) and therefore exempt from ActionDispatcher/stateManager flows.
		this.cache = (function createBoundedCache(limit = 256) {
			const store = Object.create(null);
			const order = [];
			return {
				has(k) {
					return Object.prototype.hasOwnProperty.call(store, k);
				},
				get(k) {
					return store[k];
				},
				set(k, v) {
					if (
						!Object.prototype.hasOwnProperty.call(store, k) &&
						order.length >= limit
					) {
						const oldest = order.shift();
						if (oldest !== undefined) delete store[oldest];
					}
					if (!Object.prototype.hasOwnProperty.call(store, k))
						order.push(k);
					store[k] = v;
				},
				clear() {
					for (const k of order) delete store[k];
					order.length = 0;
				},
			};
		})();

		/** Optional reference to stateManager for reporting forensic events */
		this.stateManager = stateManager;

		// Bind helper so tests or callers can override
		this._emitForensic = this._emitForensic.bind(this);
	}

	/**
	 * Async authoritative lookup. Returns true when instrumentation is allowed.
	 * @param {string|object} context
	 * @returns {Promise<boolean>}
	 */
	/* eslint-disable-next-line nodus/require-async-orchestration -- policy lookup is a lightweight helper, not an app workflow */
	async shouldInstrument(context) {
		const key = this.#keyOf(context);
		if (this.cacheResults && this.cache.has(key)) {
			return this.cache.get(key);
		}

		try {
			// Example policy keys - adapt to your SystemPolicies schema
			const auditLevel = await Promise.resolve(
				this.policyManager.getPolicy("observability", "audit_level")
			);
			const enableMetrics = await Promise.resolve(
				this.policyManager.getPolicy("observability", "enable_metrics")
			);

			const level = auditLevel || "none";
			const allowed =
				(Boolean(enableMetrics) && level !== "none") ||
				level === "full" ||
				this.#matchesContextRules(context, level);

			if (this.cacheResults) this.cache.set(key, allowed);
			// Best-effort forensic notification (non-blocking)
			this._emitForensic("evaluate", {
				context,
				decision: allowed,
				policyLevel: level,
				key,
			});
			return allowed;
		} catch (err) {
			// Safe default: do not instrument if policy lookup fails.
			console.warn(
				"[PolicyEngineAdapter] policy lookup failed, defaulting to no-instrument:",
				err?.message
			);
			return false;
		}
	}

	/**
	 * Sync fast-path using cached policies or synchronous policy manager API.
	 * Intended for hot paths (ActionDispatcher):
	 * - returns boolean
	 */
	shouldInstrumentSync(context) {
		const key = this.#keyOf(context);
		if (this.cache.has(key)) return this.cache.get(key);

		try {
			const auditLevel =
				typeof this.policyManager.getPolicySync === "function"
					? this.policyManager.getPolicySync(
							"observability",
							"audit_level"
						)
					: this.policyManager.getPolicy(
							"observability",
							"audit_level"
						);

			const enableMetrics =
				typeof this.policyManager.getPolicySync === "function"
					? this.policyManager.getPolicySync(
							"observability",
							"enable_metrics"
						)
					: this.policyManager.getPolicy(
							"observability",
							"enable_metrics"
						);

			const level = auditLevel || "none";
			const allowed =
				(Boolean(enableMetrics) && level !== "none") ||
				level === "full" ||
				this.#matchesContextRules(context, level);

			if (this.cacheResults) this.cache.set(key, allowed);
			// Synchronous forensic notification – keep non-blocking and safe
			try {
				this._emitForensic("evaluate", {
					context,
					decision: allowed,
					policyLevel: level,
					key,
				});
			} catch (e) {
				// forensic reporting must never break policy checks
				/* istanbul ignore next */
				console.warn(
					"[PolicyEngineAdapter] forensic emit failed:",
					e?.message
				);
			}
			return allowed;
		} catch (err) {
			console.warn(
				"[PolicyEngineAdapter] sync policy lookup failed, defaulting to no-instrument:",
				err?.message
			);
			return false;
		}
	}

	/**
	 * Clear cached results (call on policy reload).
	 */
	clearCache() {
		this.cache.clear();
	}

	/**
	 * Public helper to report a policy change (e.g., on reload). Best-effort.
	 * @param {object} changeInfo
	 */
	reportPolicyChange(changeInfo = {}) {
		this._emitForensic("change", { changeInfo });
	}

	/**
	 * Internal helper to send forensic events to the ForensicRegistry if present.
	 * Best-effort: never throws and never blocks the caller.
	 * @private
	 */
	_emitForensic(event, payload = {}) {
		try {
			const registry = this.stateManager?.forensicRegistry;
			if (!registry || typeof registry.wrapOperation !== "function")
				return;
			// Wrap operation to allow plugins to instrument the event. Non-blocking.
			registry.wrapOperation(
				"policy",
				event,
				() => Promise.resolve(payload),
				{
					component: "PolicyEngineAdapter",
				}
			);
		} catch (err) {
			// Best-effort only
			console.warn(
				"[PolicyEngineAdapter] failed emitting forensic event:",
				err?.message
			);
		}
	}

	/**
	 * Normalize context to a cache key.
	 * @private
	 */
	#keyOf(context) {
		if (!context) return "global";
		if (typeof context === "string") return context;
		const { domain = "global", label = "", classification = "" } = context;
		return `${domain}:${label}:${classification}`;
	}

	/**
	 * Simple context-specific matching logic. Extend to match your audit_level schema.
	 * @private
	 */
	#matchesContextRules(context, level) {
		if (typeof context === "string")
			return level === "summary" && context === "async";
		if (!context || typeof context !== "object") return false;
		if (level === "summary" && ["ui", "async"].includes(context.domain))
			return true;
		return false;
	}
}

export default PolicyEngineAdapter;
