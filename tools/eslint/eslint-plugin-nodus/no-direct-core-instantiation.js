/**
 * @file Rule to enforce that core services are not instantiated directly
 * @copyright 2024 Nodus
 * @version 2.0 - Enterprise Observability Edition
 */

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
	"AdvancedSecurityManager"
]);

// Allow instantiation inside the ServiceRegistry and specific bootstrap files
const ALLOWED_INSTANTIATORS = new Set([
	"src/platform/bootstrap/ServiceRegistry.js",
	"src/platform/bootstrap/SystemBootstrap.js",
	"src/platform/bootstrap/EnterpriseBootstrap.js",
	"src/platform/license/LicenseManager.js"
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
		"EmergencyControlSystem"
	]);
	
	if (enterpriseClasses.has(className)) {
		return `stateManager.enterprise.${getInstanceName(className)}`;
	}
	
	return `stateManager.managers.${getInstanceName(className)}`;
}

/**
 * Check if file is allowed to instantiate core classes
 */
function isAllowedInstantiator(filename) {
	const normalized = filename.replace(/\\/g, "/");
	return Array.from(ALLOWED_INSTANTIATORS).some(allowed => 
		normalized.includes(allowed)
	);
}

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow direct instantiation of core services outside of the ServiceRegistry and bootstrap files",
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
						default: true
					}
				},
				additionalProperties: false,
			},
		],
		messages: {
			noDirectInstantiation: "Do not instantiate core class '{{className}}' directly. Use {{managerPath}} via the ServiceRegistry.",
			enterpriseClassInstantiation: "Enterprise class '{{className}}' requires license validation before instantiation. Use {{managerPath}} with proper license checks.",
			missingServiceRegistry: "Core service instantiation detected outside ServiceRegistry. All core services must be managed centrally."
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || []);
		const enforceEnterprise = options.enforceEnterprise !== false;
		
		const filename = context.getFilename().replace(/\\/g, "/");
		
		// Check if this file is allowed to instantiate core classes
		const isAllowed = isAllowedInstantiator(filename) || 
			Array.from(allowIn).some(path => filename.includes(path));
		
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
			"ComplianceReporter"
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
				if (node.callee.type === 'MemberExpression' && 
					node.callee.object.type === 'Identifier' &&
					FORBIDDEN_CORE_CLASSES.has(node.callee.object.name)) {
					
					const className = node.callee.object.name;
					const methodName = node.callee.property.name;
					
					// Allow certain static methods that don't require instantiation
					const allowedStaticMethods = new Set(['getInstance', 'create', 'from', 'of']);
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
				if (source.includes('ServiceRegistry') || source.includes('bootstrap')) {
					return;
				}
				
				// Check if importing forbidden classes directly
				for (const specifier of node.specifiers) {
					if (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') {
						const importedName = specifier.imported?.name || specifier.local.name;
						
						if (FORBIDDEN_CORE_CLASSES.has(importedName)) {
							// Only warn if the import is being used for instantiation
							// (this is a more nuanced check that could be enhanced)
							context.report({
								node: specifier,
								messageId: "missingServiceRegistry",
								data: { className: importedName }
							});
						}
					}
				}
			}
		};
	},
};
