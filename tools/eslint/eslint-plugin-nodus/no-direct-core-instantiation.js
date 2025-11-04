/**
 * @file Rule to enforce that core services are not instantiated directly
 * @copyright 2024 Nodus
 * @version 2.2.0 - Enhanced allowlist support and wrapper pattern recognition
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load allowlist data
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let allowlistData = {};

try {
	const allowlistPath = path.resolve(__dirname, "../.eslint-allowlist.json");
	const allowlistContent = fs.readFileSync(allowlistPath, "utf8");
	allowlistData = JSON.parse(allowlistContent);
} catch {
	// intentionally ignore errors reading the allowlist file
	// (e.g., file missing during some dev setups). Binding the
	// exception variable is unnecessary and triggers no-unused-vars.
	allowlistData = { allowlist: {} };
}

const globalAllowlist = allowlistData.allowlist || {};

const FORBIDDEN_CORE_CLASSES = new Set([
	// Original core classes
	"SecurityManager",
	"MetricsRegistry",
	"EventFlowEngine",
	"ForensicLogger",
	"ErrorHelpers",
	"IdManager",
	"CacheManager",
	"SystemPolicies",
	"DatabaseOptimizer",
	"ManifestPluginSystem",
	"QueryService",
	"EmbeddingManager",
	"ValidationLayer",
	"ComponentDefinitionRegistry",
	"ConditionRegistry",
	"ActionHandlerRegistry",
	"AdaptiveRenderer",
	"BuildingBlockRenderer",
	"ExtensionManager",

	// New enterprise observability classes
	"UnifiedPolicyEngine",
	"SystemOptimizer",
	"PolicyControlledMetricsRegistry",
	"OptimizedAsyncOrchestrator",
	"EnterpriseForensicLogger",
	"ComplianceEngine",
	"SystemControlDashboard",
	"SignedPluginManager",
	"LicenseValidator",
	"PerformanceOptimizer",
	"RealTimeSystemTuner",
	"TenantPolicyService",
	"EmergencyControlSystem",
	"ForensicReporter",
	"ComplianceReporter",
	"SystemMetricsCollector",
	"PolicyControlledLRUCache",
	"EnterpriseQueryService",
	"OptimizedEmbeddingManager",
	"SystemControlInterface",
	"AdvancedSecurityManager",
]);

// Allow instantiation inside the ServiceRegistry and specific bootstrap files
const ALLOWED_INSTANTIATORS = new Set([
	"src/platform/bootstrap/ServiceRegistry.js",
	"src/platform/bootstrap/SystemBootstrap.js",
	"src/platform/bootstrap/EnterpriseBootstrap.js",
	"src/platform/license/LicenseManager.js",
]);

/**
 * Generate the instance name from class name (e.g., "SecurityManager" -> "securityManager")
 */
function getInstanceName(className) {
	return className.charAt(0).toLowerCase() + className.slice(1);
}

/**
 * Get the manager path for enterprise vs core services
 */
function getManagerPath(className) {
	const enterpriseClasses = new Set([
		"UnifiedPolicyEngine",
		"SystemOptimizer",
		"ComplianceEngine",
		"SystemControlDashboard",
		"SignedPluginManager",
		"LicenseValidator",
		"PerformanceOptimizer",
		"RealTimeSystemTuner",
		"EmergencyControlSystem",
	]);

	if (enterpriseClasses.has(className)) {
		return `stateManager.enterprise.${getInstanceName(className)}`;
	}

	return `stateManager.managers.${getInstanceName(className)}`;
}

/**
 * Check if file is allowed to instantiate core classes - Enhanced with allowlist support
 */
function isAllowedInstantiator(filename) {
	const normalized = filename.replace(/\\/g, "/");

	// Check built-in allowed instantiators
	if (
		Array.from(ALLOWED_INSTANTIATORS).some((allowed) =>
			normalized.includes(allowed)
		)
	) {
		return true;
	}

	// Check global allowlist for wrapper pattern files
	const wrapperFiles = globalAllowlist.wrapperPatternFiles || [];
	if (wrapperFiles.some((file) => normalized.includes(file))) {
		return true;
	}

	// Check other allowlist categories
	const allowedCategories = [
		globalAllowlist.allowDirectStorage || [],
		globalAllowlist.allowDirectCache || [],
		globalAllowlist.allowUnorchestratedAsync || [],
		globalAllowlist.allowManualPlatformCalls || [],
	];

	for (const category of allowedCategories) {
		if (category.some((path) => normalized.includes(path))) {
			return true;
		}
	}

	return false;
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow direct instantiation of core services outside of the ServiceRegistry and approved files",
			recommended: true,
		},
		schema: [
			{
				type: "object",
				properties: {
					allowIn: {
						type: "array",
						items: { type: "string" },
					},
					enforceEnterprise: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			noDirectInstantiation:
				"Do not instantiate core class '{{className}}' directly. Use {{managerPath}} via the ServiceRegistry.",
			enterpriseClassInstantiation:
				"Enterprise class '{{className}}' requires license validation before instantiation. Use {{managerPath}} with proper license checks.",
			missingServiceRegistry:
				"Core service instantiation detected outside ServiceRegistry. All core services must be managed centrally.",
			wrapperPatternAllowed:
				"This file is in wrapperPatternFiles allowlist and may instantiate core classes for wrapper patterns.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set([
			...(options.allowIn || []),
			...(globalAllowlist.wrapperPatternFiles || []),
		]);
		const enforceEnterprise = options.enforceEnterprise !== false;

		const filename = context.getFilename().replace(/\\/g, "/");

		// Check if this file is allowed to instantiate core classes
		const isAllowed =
			isAllowedInstantiator(filename) ||
			Array.from(allowIn).some((path) => filename.includes(path));

		if (isAllowed) {
			return {};
		}

		// Enterprise classes that require special handling
		const enterpriseClasses = new Set([
			"UnifiedPolicyEngine",
			"SystemOptimizer",
			"ComplianceEngine",
			"SystemControlDashboard",
			"SignedPluginManager",
			"LicenseValidator",
			"PerformanceOptimizer",
			"RealTimeSystemTuner",
			"EmergencyControlSystem",
			"ForensicReporter",
			"ComplianceReporter",
		]);

		return {
			NewExpression(node) {
				if (node.callee.type !== "Identifier") return;

				const className = node.callee.name;
				if (!FORBIDDEN_CORE_CLASSES.has(className)) return;

				const managerPath = getManagerPath(className);

				// Special handling for enterprise classes
				if (enforceEnterprise && enterpriseClasses.has(className)) {
					context.report({
						node: node.callee,
						messageId: "enterpriseClassInstantiation",
						data: { className, managerPath },
					});
				} else {
					context.report({
						node: node.callee,
						messageId: "noDirectInstantiation",
						data: { className, managerPath },
					});
				}
			},

			// Also check for static method calls that might bypass the service registry
			CallExpression(node) {
				if (
					node.callee.type === "MemberExpression" &&
					node.callee.object.type === "Identifier" &&
					FORBIDDEN_CORE_CLASSES.has(node.callee.object.name)
				) {
					const className = node.callee.object.name;
					const methodName = node.callee.property.name;

					// Allow certain static methods that don't require instantiation
					const allowedStaticMethods = new Set([
						"getInstance",
						"create",
						"from",
						"of",
					]);
					if (allowedStaticMethods.has(methodName)) return;

					const managerPath = getManagerPath(className);

					context.report({
						node: node.callee,
						messageId: "noDirectInstantiation",
						data: { className, managerPath },
					});
				}
			},

			// Check import statements for direct class imports that bypass the service registry
			ImportDeclaration(node) {
				const source = node.source.value;

				// Skip if this is importing from the service registry or bootstrap
				if (
					source.includes("ServiceRegistry") ||
					source.includes("bootstrap")
				) {
					return;
				}

				// Check if importing forbidden classes directly
				for (const specifier of node.specifiers) {
					if (
						specifier.type === "ImportSpecifier" ||
						specifier.type === "ImportDefaultSpecifier"
					) {
						const importedName =
							specifier.imported?.name || specifier.local.name;

						if (FORBIDDEN_CORE_CLASSES.has(importedName)) {
							// For wrapper pattern files, this might be OK
							const isWrapperFile = (
								globalAllowlist.wrapperPatternFiles || []
							).some((file) => filename.includes(file));

							if (isWrapperFile) {
								// Allow imports in wrapper files - they might need to export or extend
								return;
							}

							context.report({
								node: specifier,
								messageId: "missingServiceRegistry",
								data: { className: importedName },
							});
						}
					}
				}
			},
		};
	},
};
