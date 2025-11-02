/**
 * @file CanonicalResolver.js
 * @description Centralised canonical module resolver used across the Nodus
 * platform. It enforces a canonical-first search order, supports legacy name
 * mappings during migration, and surfaces observability signals when a legacy
 * path is exercised.
 */

export const DEFAULT_LEGACY_MAP = Object.freeze({
	"basic-security": "basic-crypto",
});

const DEFAULT_OPTIONS = Object.freeze({
	searchPaths: [],
	legacyMap: new Map(Object.entries(DEFAULT_LEGACY_MAP)),
	baseURL: "",
	cacheResults: true,
});

export class CanonicalResolver {
	/**
	 * @param {object} [options]
	 * @param {string[]} [options.searchPaths] Ordered canonical search roots (without trailing slash).
	 * @param {Map<string, string>} [options.legacyMap] Legacy → canonical mapping.
	 * @param {{ enforceCanonicalOnly?: boolean }} [options.policy] Optional policy flag bag.
	 * @param {{ increment?:(name:string,value?:number)=>void }} [options.metrics] Metrics surface.
	 * @param {{ logAuditEvent?:(type:string,payload:any,context?:any)=>Promise<any>|any }} [options.forensic] Forensic logger.
	 * @param {string} [options.baseURL] Fallback base URL for transitional modules (legacy storage path).
	 * @param {boolean} [options.cacheResults=true] Cache resolved modules.
	 */
	constructor(options = {}) {
		const merged = { ...DEFAULT_OPTIONS, ...options };
		this.#searchPaths = Array.isArray(merged.searchPaths)
			? merged.searchPaths.filter(Boolean)
			: [];
		const providedLegacyMap =
			merged.legacyMap instanceof Map
				? merged.legacyMap
				: new Map(Object.entries(merged.legacyMap || {}));
		this.#legacyMap = new Map(providedLegacyMap);
		this.#policy = merged.policy || {};
		this.#metrics = merged.metrics || null;
		this.#forensic = merged.forensic || null;
		this.#baseURL = merged.baseURL || "";
		this.#cacheResults = merged.cacheResults !== false;
		this.#cache = new Map();
	}

	/**
	 * Dynamically imports a module using canonical resolution.
	 * @param {string} moduleName Logical module identifier.
	 * @param {object} [options]
	 * @param {boolean} [options.forceRefresh=false] Skip cached entry.
	 * @returns {Promise<{ module:any, url:string, canonical:boolean, fromLegacy:boolean }>}
	 */
	async import(moduleName, options = {}) {
		const forceRefresh = options.forceRefresh === true;
		const cacheKey = moduleName;
		if (!forceRefresh && this.#cacheResults && this.#cache.has(cacheKey)) {
			return this.#cache.get(cacheKey);
		}

		const variants = this.#buildNameVariants(moduleName);
		const candidates = this.#buildCandidates(variants, moduleName);

		let lastError = null;
		for (const candidate of candidates) {
			try {
				const mod = await import(
					/* @vite-ignore */ candidate.url
				);
				const result = {
					module: mod,
					url: candidate.url,
					canonical: !candidate.fromLegacy,
					fromLegacy: candidate.fromLegacy,
				};
				this.#recordSuccess(moduleName, candidate);
				if (this.#cacheResults) {
					this.#cache.set(cacheKey, result);
				}
				return result;
			} catch (error) {
				lastError = error;
				this.#recordFailureAttempt(moduleName, candidate, error);
			}
		}

		this.#recordFailure(moduleName, lastError);
		throw new Error(
			`CanonicalResolver: failed to resolve '${moduleName}' (last error: ${
				lastError?.message || "unknown"
			})`
		);
	}

	/**
	 * Maps a legacy module name to its canonical equivalent.
	 * @param {string} name
	 * @returns {string}
	 */
	mapLegacy(name) {
		return this.#legacyMap.get(name) || name;
	}

	/**
	 * Indicates whether a module name is already canonical.
	 * @param {string} name
	 * @returns {boolean}
	 */
	isCanonical(name) {
		return !this.#legacyMap.has(name);
	}

	/**
	 * Adds or updates a legacy alias.
	 * @param {string} legacy
	 * @param {string} canonical
	 */
	addLegacyAlias(legacy, canonical) {
		this.#legacyMap.set(legacy, canonical);
		this.#cache.clear();
	}

	/**
	 * Enables or disables strict canonical enforcement.
	 * When enabled, legacy resolutions throw errors instead of falling back.
	 * @param {boolean} enabled
	 */
	setStrictMode(enabled) {
		this.#policy.enforceCanonicalOnly = enabled === true;
	}

	/**
	 * Provides diagnostic information.
	 * @returns {object}
	 */
	snapshot() {
		return {
			searchPaths: [...this.#searchPaths],
			legacyCount: this.#legacyMap.size,
			cacheSize: this.#cache.size,
			strictMode: !!this.#policy.enforceCanonicalOnly,
			baseURL: this.#baseURL,
		};
	}

	#buildNameVariants(name) {
		const variants = new Set([name]);
		const canonical = this.#legacyMap.get(name);
		if (canonical) {
			variants.add(canonical);
		}
		return variants;
	}

	#buildCandidates(variants, originalName) {
		const candidates = [];
		const seen = new Set();

		const pushCandidate = (url, fromLegacy, fallback) => {
			const normalised = url.replace(/\/+/g, "/");
			if (seen.has(normalised)) return;
			seen.add(normalised);
			candidates.push({
				url: normalised,
				fromLegacy,
				fallback,
			});
		};

		for (const variant of variants) {
			const isLegacyVariant = variant !== originalName;
			for (const root of this.#searchPaths) {
				pushCandidate(
					`${root}/${variant}.js`,
					isLegacyVariant,
					false
				);
			}
			if (this.#baseURL) {
				pushCandidate(
					`${this.#baseURL}${variant}.js`,
					isLegacyVariant,
					true
				);
			}
		}

		// As a last resort, try explicit path using original name.
		if (this.#baseURL) {
			pushCandidate(
				`${this.#baseURL}${originalName}.js`,
				false,
				true
			);
		}

		return candidates;
	}

	#recordSuccess(moduleName, candidate) {
		this.#metrics?.increment?.("canonical.resolve.success", 1);
		if (candidate.fromLegacy) {
			this.#metrics?.increment?.("canonical.resolve.legacy_hit", 1);
		}

		if (
			candidate.fromLegacy &&
			this.#policy?.enforceCanonicalOnly === true
		) {
			const payload = {
				moduleName,
				resolvedUrl: candidate.url,
			};
			this.#forensic
				?.logAuditEvent?.(
					"CANONICAL_RESOLVE_POLICY_VIOLATION",
					payload,
					{ component: "CanonicalResolver" }
				)
				?.catch?.(() => {});
			throw new Error(
				`CanonicalResolver: strict mode violation for '${moduleName}'`
			);
		}

		if (candidate.fromLegacy) {
			this.#forensic
				?.logAuditEvent?.(
					"CANONICAL_RESOLVE_FALLBACK",
					{
						moduleName,
						resolvedUrl: candidate.url,
					},
					{ component: "CanonicalResolver", severity: "info" }
				)
				?.catch?.(() => {});
		}
	}

	#recordFailureAttempt(moduleName, candidate, error) {
		this.#metrics?.increment?.("canonical.resolve.attempt_failed", 1);
		this.#forensic
			?.logAuditEvent?.(
				"CANONICAL_RESOLVE_ATTEMPT_FAILED",
				{
					moduleName,
					url: candidate.url,
					error: error?.message || String(error),
				},
				{ component: "CanonicalResolver", severity: "debug" }
			)
			?.catch?.(() => {});
	}

	#recordFailure(moduleName, error) {
		this.#metrics?.increment?.("canonical.resolve.failure", 1);
		this.#forensic
			?.logAuditEvent?.(
				"CANONICAL_RESOLVE_FAILURE",
				{
					moduleName,
					error: error?.message || String(error),
				},
				{ component: "CanonicalResolver", severity: "warning" }
			)
			?.catch?.(() => {});
	}

	#searchPaths;
	#legacyMap;
	#policy;
	#metrics;
	#forensic;
	#baseURL;
	#cacheResults;
	#cache;
}

export default CanonicalResolver;
