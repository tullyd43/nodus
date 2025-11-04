/**
 * ObservabilityStackBootstrap.js
 *
 * Bootstraps and wires together observability services used across the
 * platform. This file intentionally keeps wiring minimal and relies on
 * the provided `stateManager` to supply the AsyncOrchestrator and
 * ServiceRegistry managed instances.
 */
import { AsyncOperationTracker } from "./AsyncOperationTracker.js";
import { AutomaticInstrumentation } from "./AutomaticInstrumentation.js";
import { ForensicRegistry } from "./ForensicRegistry.js";
import { ObservabilityCacheHandler } from "./ObservabilityCacheHandler.js";
import { PerformanceProfiler } from "./PerformanceProfiler.js";
import { AIOperationsForensicPlugin } from "./plugins/AIOperationsForensicPlugin.js";
import { APIForensicPlugin } from "./plugins/APIForensicPlugin.js";
import { AuthForensicPlugin } from "./plugins/AuthForensicPlugin.js";
import { BaseForensicPlugin } from "./plugins/BaseForensicPlugin.js"; // Import BaseForensicPlugin
import { ConfigForensicPlugin } from "./plugins/ConfigForensicPlugin.js";
import { CryptoForensicPlugin } from "./plugins/CryptoForensicPlugin.js";
import { DatabaseForensicPlugin } from "./plugins/DatabaseForensicPlugin.js";
import { EmbeddingForensicPlugin } from "./plugins/EmbeddingForensicPlugin.js";
import { FileForensicPlugin } from "./plugins/FileForensicPlugin.js";
import { HealthForensicPlugin } from "./plugins/HealthForensicPlugin.js";
import { I18nForensicPlugin } from "./plugins/I18nForensicPlugin.js";
import { JobForensicPlugin } from "./plugins/JobForensicPlugin.js";
import { NetworkForensicPlugin } from "./plugins/NetworkForensicPlugin.js";
import { PluginForensicPlugin } from "./plugins/PluginForensicPlugin.js";
import { PolicyForensicPlugin } from "./plugins/PolicyForensicPlugin.js";
import { SearchForensicPlugin } from "./plugins/SearchForensicPlugin.js";
import { SecurityForensicPlugin } from "./plugins/SecurityForensicPlugin.js";
import { ServiceForensicPlugin } from "./plugins/ServiceForensicPlugin.js";
import { StorageForensicPlugin } from "./plugins/StorageForensicPlugin.js";
import { SyncForensicPlugin } from "./plugins/SyncForensicPlugin.js";
import { UIForensicPlugin } from "./plugins/UIForensicPlugin.js";
import { PluginSignatureValidator } from "./PluginSignatureValidator.js";
import { SyncOperationTracker } from "./SyncOperationTracker.js";

export const ObservabilityStackBootstrap = {
	/**
	 * Initialize observability stack and register components on stateManager
	 * @param {import('../../state/HybridStateManager.js').default} stateManager
	 * @param {object|null} enterpriseLicense
	 */
	/* eslint-disable-next-line nodus/require-async-orchestration -- bootstrap initialization may run before orchestrator is available; callers should invoke via orchestrator when required */
	async initialize(stateManager, enterpriseLicense = null) {
		const log = stateManager.managers?.observabilityLogger || console;
		const policies = stateManager.managers?.policies;
		const dispatcher = stateManager.managers?.actionDispatcher;

		try {
			log?.info?.("[OBS] Bootstrapping Observability Stack...");

			// Core services
			const instrumentation = new AutomaticInstrumentation(stateManager);
			const asyncTracker = new AsyncOperationTracker(stateManager);
			const syncTracker = new SyncOperationTracker(stateManager);
			const forensicRegistry = new ForensicRegistry(
				stateManager,
				enterpriseLicense
			);
			const performanceProfiler = new PerformanceProfiler(stateManager);
			const signatureValidator = new PluginSignatureValidator(
				stateManager
			);

			// Expose under stateManager.managers.observability
			stateManager.managers.observability = {
				instrumentation,
				asyncTracker,
				syncTracker,
				forensicRegistry,
				signatureValidator,
				performanceProfiler,
			};

			const registered = [];

			const tier = this.determineLicenseTier(enterpriseLicense);
			const availablePlugins = this.getPluginsForTier(tier);

			for (const {
				name,
				plugin: PluginClass,
				features,
			} of availablePlugins) {
				try {
					const pluginInstance = new PluginClass(
						stateManager,
						features
					);
					await forensicRegistry.register(name, pluginInstance);
					registered.push(name);
					log?.info?.(
						`[OBS] Registered forensic plugin: ${name} (Tier: ${tier}, Features: ${features.join(", ")})`
					);
				} catch (err) {
					log?.warn?.(
						`[OBS] ${name} plugin registration failed for tier ${tier}`,
						err
					);
				}
			}

			// Register handlers with the ActionDispatcher when available
			if (dispatcher?.registerHandlers) {
				dispatcher.registerHandlers(ObservabilityCacheHandler);
				log?.info?.("[OBS] ObservabilityCacheHandler registered");
			}

			// Set sensible policy defaults if the policy manager exposes setDefaults
			if (policies?.setDefaults) {
				const defaults = {
					"observability.instrumentation": {
						enabled: true,
						sampleRate: 1.0,
					},
					"observability.forensics": { auditLevel: "optimized" },
					"observability.metrics": { enabled: true, retention: "7d" },
					"observability.async": { enabled: true },
					"observability.cache": { enabled: true }, // This is for the cache manager, not a plugin
				};

				for (const domain of registered) {
					defaults[`observability.${domain}`] = {
						enabled: true,
						auditLevel:
							tier === "defense"
								? "full"
								: tier === "enterprise"
									? "optimized"
									: "minimal",
					};
				}

				policies.setDefaults(defaults);
				log?.info?.("[OBS] Observability policies initialized", {
					domains: registered,
				});

				// If a policyAdapter is already attached, notify it of the policy defaults
				// so any cached decisions can be updated. This is best-effort.
				try {
					const policyAdapter = stateManager.managers?.policyAdapter;
					if (
						policyAdapter &&
						typeof policyAdapter.reportPolicyChange === "function"
					) {
						policyAdapter.reportPolicyChange({ defaults });
					}
				} catch (e) {
					// never fail bootstrap due to notification
					log?.warn?.(
						"[OBS] policyAdapter report failed",
						e?.message
					);
				}
			}

			// Warm-up / precompute
			try {
				instrumentation.precomputeInstrumentationMatrix?.();
			} catch (err) {
				log?.warn?.("[OBS] Precompute matrix failed", err);
			}

			log?.info?.("[OBS] Observability Stack ready");

			// Optional self-recording to validate everything is live
			try {
				await asyncTracker?.record?.("observability.bootstrap", {
					status: "success",
				});
			} catch {
				// Non-fatal; moving on
			}
		} catch (err) {
			console.error(
				"[OBS] ObservabilityStackBootstrap initialization error:",
				err
			);
			stateManager.managers?.observabilityLogger?.error?.(
				"[OBS] ObservabilityStackBootstrap failed",
				{ err }
			);
		}
	},
};

/**
 * Determines the license tier based on the provided enterprise license.
 * @param {object|null} enterpriseLicense - The enterprise license object.
 * @returns {'consumer'|'enterprise'|'defense'} The determined license tier.
 */
ObservabilityStackBootstrap.determineLicenseTier = function (
	enterpriseLicense
) {
	if (enterpriseLicense?.tier === "defense") return "defense";
	if (enterpriseLicense?.tier === "enterprise") return "enterprise";
	return "consumer";
};

/**
 * Returns a list of observability plugins applicable for a given license tier.
 * @param {'consumer'|'enterprise'|'defense'} tier - The license tier.
 * @returns {Array<{name: string, plugin: typeof BaseForensicPlugin, tier: string, features: string[]}>}
 */
ObservabilityStackBootstrap.getPluginsForTier = function (tier) {
	const allPlugins = [
		// Consumer tier (basic observability)
		{
			name: "storage",
			plugin: StorageForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "security",
			plugin: SecurityForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "auth",
			plugin: AuthForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "api",
			plugin: APIForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "plugins",
			plugin: PluginForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "config",
			plugin: ConfigForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "policy",
			plugin: PolicyForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "service",
			plugin: ServiceForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},
		{
			name: "ui",
			plugin: UIForensicPlugin,
			tier: "consumer",
			features: ["basic"],
		},

		// Enterprise tier (full business observability) - extends consumer
		{
			name: "database",
			plugin: DatabaseForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "network",
			plugin: NetworkForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "sync",
			plugin: SyncForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "files",
			plugin: FileForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "i18n",
			plugin: I18nForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "search",
			plugin: SearchForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "embeddings",
			plugin: EmbeddingForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "ai",
			plugin: AIOperationsForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "jobs",
			plugin: JobForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},
		{
			name: "health",
			plugin: HealthForensicPlugin,
			tier: "enterprise",
			features: ["full"],
		},

		// Defense tier (classified/government observability) - extends enterprise
		{
			name: "crypto",
			plugin: CryptoForensicPlugin,
			tier: "defense",
			features: ["classified", "deep_packet"],
		},
		// Note: SecurityForensicPlugin is already included in consumer, but its features might be enhanced by the tier.
		// For simplicity, we'll assume the features array passed to the constructor handles this.
	];

	const tierHierarchy = { consumer: 0, enterprise: 1, defense: 2 };
	const userLevel = tierHierarchy[tier];

	// Filter plugins based on the user's license tier.
	// If a plugin is defined for a lower tier, it's available to higher tiers.
	const filteredPlugins = allPlugins.filter(
		(pluginDef) => tierHierarchy[pluginDef.tier] <= userLevel
	);

	// For plugins that are available across multiple tiers, we might want to adjust their features
	// based on the *current* tier, even if they were initially defined for a lower tier.
	// This example simply passes the features defined in `allPlugins`.
	// A more advanced implementation could merge or override features here.
	return filteredPlugins.map((pluginDef) => 
		// If a plugin is in a lower tier but the current tier is higher,
		// we might want to give it more advanced features.
		// For now, we'll just use the features defined in the allPlugins array.
		// Example: if tier is 'enterprise' and pluginDef.tier is 'consumer',
		// you might want to add 'enterprise_enhancements' to its features.
		 ({ ...pluginDef })
	);
};

export default ObservabilityStackBootstrap;
