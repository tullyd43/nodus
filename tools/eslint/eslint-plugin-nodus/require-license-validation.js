/**
 * @file Rule to enforce enterprise license validation for gated features
 * @copyright 2024 Nodus
 */

const ENTERPRISE_FEATURES = new Map([
	// Performance optimization features
	["optimizePerformance", "system_optimization"],
	["emergencySystemControl", "emergency_controls"],
	["setPerformanceProfile", "performance_tuning"],
	["enableRealTimeOptimization", "real_time_optimization"],

	// Advanced observability features
	["getSystemMetrics", "enterprise_dashboard"],
	["getComplianceMetrics", "compliance_automation"],
	["generateComplianceReport", "compliance_automation"],
	["setTenantPolicies", "multi_tenant_policies"],

	// System control features
	["updateSystemPolicy", "system_control"],
	["configureSystemPolicies", "system_control"],
	["setOptimizationLevel", "system_optimization"],
	["enableMaxPerformanceMode", "performance_optimization"],

	// Advanced forensics
	["enableFullForensicLogging", "advanced_forensics"],
	["generateForensicReport", "forensic_reporting"],
	["setRetentionPolicy", "advanced_retention"],

	// Plugin management
	["registerSignedPlugin", "signed_plugins"],
	["validatePluginSignature", "plugin_validation"],
	["loadEnterprisePlugin", "enterprise_plugins"],
]);

const ENTERPRISE_CLASSES = new Set([
	"SystemOptimizer",
	"UnifiedPolicyEngine",
	"EnterpriseForensicLogger",
	"ComplianceEngine",
	"SystemControlDashboard",
	"PolicyControlledMetricsRegistry",
	"OptimizedAsyncOrchestrator",
	"SignedPluginManager",
]);

const LICENSE_CHECK_PATTERNS = [
	/license\.hasFeature\(/,
	/\.license\.hasFeature\(/,
	/checkEnterpriseFeature\(/,
	/validateEnterpriseAccess\(/,
	/requiresEnterpriseLicense\(/,
	/@requiresEnterpriseLicense/,
];

/**
 * Check if a function or class has license validation
 */
function hasLicenseValidation(sourceCode, node) {
	const text = sourceCode.getText(node);
	return LICENSE_CHECK_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if a method name corresponds to an enterprise feature
 */
function getEnterpriseFeature(methodName) {
	return ENTERPRISE_FEATURES.get(methodName);
}

/**
 * Check if a class name is enterprise-only
 */
function isEnterpriseClass(className) {
	return ENTERPRISE_CLASSES.has(className);
}

/**
 * Find method definition within a class
 */
// NOTE: removed unused helper `isMethodInClass` to avoid lint warnings. If needed
// in future, reintroduce with a specific usage.

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce enterprise license validation for gated features and classes",
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
					strictMode: {
						type: "boolean",
						default: false,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingLicenseCheck:
				"Enterprise feature '{{feature}}' requires license validation. Add: license.hasFeature('{{featureFlag}}') check.",
			enterpriseClassUnprotected:
				"Enterprise class '{{className}}' must validate license in constructor or methods.",
			enterpriseMethodUnprotected:
				"Enterprise method '{{methodName}}' must validate license before execution.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(
			options.allowIn || [
				"tests/",
				"src/platform/bootstrap/",
				"src/platform/license/",
			]
		);
		const strictMode = options.strictMode || false;

		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some((path) =>
			filename.includes(path)
		);

		if (isAllowed) {
			return {};
		}

		const sourceCode = context.getSourceCode();

		return {
			// Check enterprise class instantiation
			NewExpression(node) {
				if (node.callee.type !== "Identifier") return;

				const className = node.callee.name;
				if (!isEnterpriseClass(className)) return;

				// Find the containing function/constructor
				let parent = node.parent;
				while (
					parent &&
					![
						"FunctionDeclaration",
						"FunctionExpression",
						"ArrowFunctionExpression",
						"MethodDefinition",
					].includes(parent.type)
				) {
					parent = parent.parent;
				}

				if (!parent) return;

				if (!hasLicenseValidation(sourceCode, parent)) {
					context.report({
						node: node.callee,
						messageId: "enterpriseClassUnprotected",
						data: { className },
					});
				}
			},

			// Check enterprise method definitions
			MethodDefinition(node) {
				if (node.key.type !== "Identifier") return;

				const methodName = node.key.name;
				const featureFlag = getEnterpriseFeature(methodName);

				if (!featureFlag) return;

				// Skip if this is in an allowed location
				if (isAllowed) return;

				// Check if method has license validation
				if (!hasLicenseValidation(sourceCode, node)) {
					context.report({
						node: node.key,
						messageId: "enterpriseMethodUnprotected",
						data: { methodName },
					});
				}
			},

			// Check enterprise method calls
			CallExpression(node) {
				let methodName = null;

				// Handle method calls
				if (
					node.callee.type === "MemberExpression" &&
					node.callee.property.type === "Identifier"
				) {
					methodName = node.callee.property.name;
				}

				if (!methodName) return;

				const featureFlag = getEnterpriseFeature(methodName);
				if (!featureFlag) return;

				// Find the containing function to check for license validation
				let containingFunction = node.parent;
				while (
					containingFunction &&
					![
						"FunctionDeclaration",
						"FunctionExpression",
						"ArrowFunctionExpression",
						"MethodDefinition",
					].includes(containingFunction.type)
				) {
					containingFunction = containingFunction.parent;
				}

				if (!containingFunction) return;

				// In strict mode, require license check in the same function
				// In normal mode, allow license check anywhere in the call chain
				if (strictMode) {
					if (!hasLicenseValidation(sourceCode, containingFunction)) {
						context.report({
							node: node.callee.property,
							messageId: "missingLicenseCheck",
							data: {
								feature: methodName,
								featureFlag,
							},
						});
					}
				} else {
					// Check if there's any license validation in the broader context
					const classNode = containingFunction.parent;
					if (classNode && classNode.type === "ClassDeclaration") {
						if (!hasLicenseValidation(sourceCode, classNode)) {
							context.report({
								node: node.callee.property,
								messageId: "missingLicenseCheck",
								data: {
									feature: methodName,
									featureFlag,
								},
							});
						}
					} else if (
						!hasLicenseValidation(sourceCode, containingFunction)
					) {
						context.report({
							node: node.callee.property,
							messageId: "missingLicenseCheck",
							data: {
								feature: methodName,
								featureFlag,
							},
						});
					}
				}
			},
		};
	},
};
