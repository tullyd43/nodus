/**
 * @file Rule to ensure operations use automatic observability through orchestrator, ForensicRegistry, and ActionDispatcher
 * @copyright 2024 Nodus
 * @version 2.2.0 - Enhanced wrapper pattern recognition and allowlist support
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

const OBSERVABLE_OPERATIONS = new Map([
	// Cache operations - must go through ForensicRegistry for security
	[
		"get",
		{
			requiresForensic: true,
			requiresOrchestrator: false,
			category: "cache",
		},
	],
	[
		"set",
		{
			requiresForensic: true,
			requiresOrchestrator: false,
			category: "cache",
		},
	],
	[
		"delete",
		{
			requiresForensic: true,
			requiresOrchestrator: false,
			category: "cache",
		},
	],
	[
		"clear",
		{
			requiresForensic: true,
			requiresOrchestrator: false,
			category: "cache",
		},
	],

	// Storage operations - must go through ActionDispatcher for state mutations
	[
		"put",
		{
			requiresActionDispatcher: true,
			requiresOrchestrator: false,
			category: "storage",
		},
	],
	[
		"update",
		{
			requiresActionDispatcher: true,
			requiresOrchestrator: false,
			category: "storage",
		},
	],
	[
		"save",
		{
			requiresActionDispatcher: true,
			requiresOrchestrator: false,
			category: "storage",
		},
	],
	[
		"create",
		{
			requiresActionDispatcher: true,
			requiresOrchestrator: false,
			category: "storage",
		},
	],
	[
		"upsert",
		{
			requiresActionDispatcher: true,
			requiresOrchestrator: false,
			category: "storage",
		},
	],

	// Network operations - must use CDS transport and orchestrator
	[
		"fetch",
		{ requiresOrchestrator: true, requiresCDS: true, category: "network" },
	],
	[
		"request",
		{ requiresOrchestrator: true, requiresCDS: true, category: "network" },
	],

	// Async business operations - must go through orchestrator
	["process", { requiresOrchestrator: true, category: "business" }],
	["execute", { requiresOrchestrator: true, category: "business" }],
	["generate", { requiresOrchestrator: true, category: "business" }],
	["analyze", { requiresOrchestrator: true, category: "business" }],
	["compute", { requiresOrchestrator: true, category: "business" }],

	// System operations - automatically observable through system control
	[
		"optimizePerformance",
		{
			autoInstrumented: true,
			requiresLicense: "system_optimization",
			category: "system",
		},
	],
	[
		"emergencySystemControl",
		{
			autoInstrumented: true,
			requiresLicense: "emergency_controls",
			category: "system",
		},
	],
]);

// Patterns that indicate manual logging (anti-pattern)
const MANUAL_LOGGING_PATTERNS = [
	// Direct forensic logger calls (should go through ForensicRegistry)
	/forensicLogger\.createEnvelope\(/,
	/forensicLogger\.logAuditEvent\(/,
	/\.logForensicEvent\(/,
	/ForensicLogger\.(createEnvelope|logAuditEvent)\(/,

	// Direct metrics calls (should be automatic through orchestrator)
	/metricsRegistry\.(increment|timer|gauge)\(/,
	/\.metrics\.(increment|timer|gauge)\(/,
	/MetricsRegistry\.(increment|timer)\(/,

	// Direct state manager calls (should go through ActionDispatcher)
	/stateManager\.emit\(/,
	/\.stateManager\.emit\(/,
];

// Enhanced patterns that indicate proper Nodus architecture compliance
const COMPLIANT_PATTERNS = [
	// Orchestrator patterns (including wrapper patterns like EmbeddingManager)
	/orchestrator\.run\(/,
	/\.createRunner\(/,
	/AsyncOrchestrator\.run\(/,
	/asyncOrchestrator\.(run|wrap)\(/,
	/\.#runOrchestrated\(/, // EmbeddingManager wrapper pattern
	/#runOrchestrated\(/, // Direct wrapper calls
	/this\.#runOrchestrated\(/,
	/await\s+this\.#runOrchestrated\(/,
	/return\s+this\.#runOrchestrated\(/,

	// ForensicRegistry patterns (secure operations)
	/forensicRegistry\.wrapOperation\(/,
	/\.forensicRegistry\.wrapOperation\(/,
	/observability\.forensicRegistry\.wrapOperation\(/,
	/\.observability\.forensicRegistry\.wrapOperation\(/,

	// ActionDispatcher patterns (state mutations) - Enhanced for EmbeddingManager patterns
	/actionDispatcher\.dispatch\(/,
	/\.actionDispatcher\.dispatch\(/,
	/managers\.actionDispatcher\.dispatch\(/,
	/\.managers\.actionDispatcher\.dispatch\(/,
	/this\.#stateManager\.managers\.actionDispatcher\.dispatch\(/,
	/stateManager\.managers\.actionDispatcher\.dispatch\(/,

	// CDS transport patterns (secure network)
	/CDS\.fetch\(/,
	/cdsTransport\./,
	/createProxyTransport\(/,

	// Auto-instrumented patterns (including HybridStateManager access)
	/stateManager\.managers\./,
	/this\.#stateManager\.managers\./,
	/this\.#managers\./,
	/\.managers\.(storage|policies|cache)\./,
	/systemControl\./,
	/\.enterprise\./,
];

/**
 * Check if operation requires specific compliance pattern
 */
function getComplianceRequirement(methodName) {
	return OBSERVABLE_OPERATIONS.get(methodName);
}

/**
 * Check if code uses manual logging (anti-pattern)
 */
function hasManualLogging(sourceCode, node) {
	const text = sourceCode.getText(node);
	return MANUAL_LOGGING_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if code uses compliant patterns - Enhanced for wrapper recognition
 */
function usesCompliantPattern(sourceCode, node, requiredPattern) {
	const text = sourceCode.getText(node);

	switch (requiredPattern) {
		case "orchestrator":
			return [
				/orchestrator\.run\(/,
				/\.createRunner\(/,
				/AsyncOrchestrator\.run\(/,
				/asyncOrchestrator\.(run|wrap)\(/,
				/\.#runOrchestrated\(/,
				/#runOrchestrated\(/,
				/this\.#runOrchestrated\(/,
				/await\s+this\.#runOrchestrated\(/,
				/return\s+this\.#runOrchestrated\(/,
			].some((pattern) => pattern.test(text));

		case "forensic":
			return [
				/forensicRegistry\.wrapOperation\(/,
				/\.forensicRegistry\.wrapOperation\(/,
				/observability\.forensicRegistry\.wrapOperation\(/,
				/\.observability\.forensicRegistry\.wrapOperation\(/,
			].some((pattern) => pattern.test(text));

		case "actionDispatcher":
			return [
				/actionDispatcher\.dispatch\(/,
				/\.actionDispatcher\.dispatch\(/,
				/managers\.actionDispatcher\.dispatch\(/,
				/\.managers\.actionDispatcher\.dispatch\(/,
				/this\.#stateManager\.managers\.actionDispatcher\.dispatch\(/,
				/stateManager\.managers\.actionDispatcher\.dispatch\(/,
			].some((pattern) => pattern.test(text));

		case "cds":
			return [
				/CDS\.fetch\(/,
				/cdsTransport\./,
				/createProxyTransport\(/,
			].some((pattern) => pattern.test(text));

		case "autoInstrumented":
			return [
				/stateManager\.managers\./,
				/this\.#stateManager\.managers\./,
				/this\.#managers\./,
				/\.managers\.(storage|policies|cache)\./,
				/systemControl\./,
				/\.enterprise\./,
			].some((pattern) => pattern.test(text));

		default:
			return COMPLIANT_PATTERNS.some((pattern) => pattern.test(text));
	}
}

/**
 * Find containing function for context analysis
 */
function getContainingFunction(node) {
	let current = node.parent;
	while (current) {
		if (
			[
				"FunctionDeclaration",
				"FunctionExpression",
				"ArrowFunctionExpression",
				"MethodDefinition",
			].includes(current.type)
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

/**
 * Get method context from call expression
 */
function getMethodContext(node) {
	let methodName = null;
	let objectContext = null;

	if (node.callee.type === "MemberExpression") {
		methodName = node.callee.property.name;
		objectContext = node.callee.object;
	} else if (node.callee.type === "Identifier") {
		methodName = node.callee.name;
	}

	return { methodName, objectContext };
}

/**
 * Determine if this is a cache operation based on context
 */
function isCacheOperation(node, sourceCode) {
	const text = sourceCode.getText(node);
	return /cache|Cache/.test(text) || /\.get\(|\.set\(|\.delete\(/.test(text);
}

/**
 * Determine if this is a storage operation based on context
 */
function isStorageOperation(node, sourceCode) {
	const text = sourceCode.getText(node);
	return /storage|Storage|\.put\(|\.save\(|\.update\(|\.create\(|\.upsert\(/.test(
		text
	);
}

/**
 * Check if this is a wrapper pattern class like EmbeddingManager
 */
function isWrapperPatternClass(node, sourceCode) {
	// Look for the #runOrchestrated pattern or similar wrapper methods
	const classText = sourceCode.getText(node);
	return /#runOrchestrated|#runSecure|#orchestrate/.test(classText);
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ensure operations use proper Nodus observability patterns: ForensicRegistry for cache, ActionDispatcher for state, orchestrator for async operations",
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
					enforceForensic: {
						type: "boolean",
						default: true,
					},
					enforceActionDispatcher: {
						type: "boolean",
						default: true,
					},
					enforceOrchestrator: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			manualLoggingDetected:
				"Manual observability detected. Use proper Nodus patterns: ForensicRegistry, ActionDispatcher, or orchestrator instead of manual {{method}} calls.",
			missingForensicRegistry:
				"Cache operation '{{operation}}' requires ForensicRegistry for security compliance. Use: forensicRegistry.wrapOperation('cache', '{{operation}}', ...)",
			missingActionDispatcher:
				"State mutation '{{operation}}' requires ActionDispatcher for observability. Use: actionDispatcher.dispatch('{{operation}}', payload)",
			missingOrchestrator:
				"Async operation '{{operation}}' requires orchestrator for observability. Use orchestrator pattern or #runOrchestrated wrapper.",
			missingCDSTransport:
				"Network operation '{{operation}}' requires CDS transport for security. Use: CDS.fetch() instead of raw fetch.",
			useProperInstrumentation:
				"Operation '{{operation}}' should use proper Nodus instrumentation pattern for {{category}} operations.",
			encourageCompliantPatterns:
				"Consider using Nodus-compliant observability patterns instead of manual instrumentation.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set([
			...(options.allowIn || []),
			...(globalAllowlist.wrapperPatternFiles || []),
			...(globalAllowlist.forensicRegistryExempt || []),
			...(globalAllowlist.actionDispatcherExempt || []),
			"tests/",
			"src/platform/bootstrap/",
			"src/platform/observability/", // Allow manual patterns in observability implementation
			"src/shared/lib/async/", // Allow in orchestrator implementation
			"src/devtools/",
			"scripts/",
		]);

		const enforceForensic = options.enforceForensic !== false;
		const enforceActionDispatcher =
			options.enforceActionDispatcher !== false;
		const enforceOrchestrator = options.enforceOrchestrator !== false;

		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some((path) =>
			filename.includes(path)
		);

		if (isAllowed) {
			return {};
		}

		const sourceCode = context.getSourceCode();

		return {
			// Check for manual logging anti-patterns
			CallExpression(node) {
				// Check for manual forensic/metrics logging
				const callText = sourceCode.getText(node);
				for (const pattern of MANUAL_LOGGING_PATTERNS) {
					if (pattern.test(callText)) {
						const match = callText.match(/\.(\w+)\(/);
						const methodName = match ? match[1] : "logging method";

						context.report({
							node,
							messageId: "manualLoggingDetected",
							data: { method: methodName },
						});
						return;
					}
				}

				// Analyze method calls for compliance requirements
				// objectContext isn't currently used here; prefix with '_' to satisfy no-unused-vars rule
				const { methodName, objectContext: _objectContext } =
					getMethodContext(node);
				if (!methodName) return;

				const requirement = getComplianceRequirement(methodName);
				if (!requirement) return;

				const containingFunction = getContainingFunction(node);
				if (!containingFunction) return;

				// Check if we're in a wrapper pattern class
				let containingClass = containingFunction.parent;
				while (
					containingClass &&
					containingClass.type !== "ClassDeclaration"
				) {
					containingClass = containingClass.parent;
				}

				if (
					containingClass &&
					isWrapperPatternClass(containingClass, sourceCode)
				) {
					// This is in a wrapper pattern class, more lenient checking
					return;
				}

				// Check ForensicRegistry requirement for cache operations
				if (
					enforceForensic &&
					(requirement.requiresForensic ||
						isCacheOperation(node, sourceCode))
				) {
					if (
						!usesCompliantPattern(
							sourceCode,
							containingFunction,
							"forensic"
						)
					) {
						context.report({
							node,
							messageId: "missingForensicRegistry",
							data: { operation: methodName },
						});
						return;
					}
				}

				// Check ActionDispatcher requirement for state mutations
				if (
					enforceActionDispatcher &&
					(requirement.requiresActionDispatcher ||
						isStorageOperation(node, sourceCode))
				) {
					if (
						!usesCompliantPattern(
							sourceCode,
							containingFunction,
							"actionDispatcher"
						)
					) {
						context.report({
							node,
							messageId: "missingActionDispatcher",
							data: { operation: methodName },
						});
						return;
					}
				}

				// Check orchestrator requirement for async operations
				if (enforceOrchestrator && requirement.requiresOrchestrator) {
					if (
						!usesCompliantPattern(
							sourceCode,
							containingFunction,
							"orchestrator"
						)
					) {
						context.report({
							node,
							messageId: "missingOrchestrator",
							data: { operation: methodName },
						});
						return;
					}
				}

				// Check CDS transport requirement for network operations
				if (requirement.requiresCDS) {
					if (
						!usesCompliantPattern(
							sourceCode,
							containingFunction,
							"cds"
						)
					) {
						context.report({
							node,
							messageId: "missingCDSTransport",
							data: { operation: methodName },
						});
						return;
					}
				}

				// Check auto-instrumentation requirement
				if (requirement.autoInstrumented) {
					if (
						!usesCompliantPattern(
							sourceCode,
							containingFunction,
							"autoInstrumented"
						)
					) {
						context.report({
							node,
							messageId: "useProperInstrumentation",
							data: {
								operation: methodName,
								category: requirement.category || "system",
							},
						});
						return;
					}
				}
			},

			// Check for manual instrumentation in functions - More lenient for wrapper classes
			"FunctionDeclaration, MethodDefinition"(node) {
				if (hasManualLogging(sourceCode, node)) {
					const functionName =
						node.key?.name || node.id?.name || "anonymous";

					// Skip functions that are clearly observability implementation
					const observabilityFunctions = [
						"log",
						"audit",
						"forensic",
						"emit",
						"track",
						"record",
						"instrument",
						"observe",
						"monitor",
						"measure",
					];

					const isObservabilityFunction = observabilityFunctions.some(
						(term) => functionName.toLowerCase().includes(term)
					);

					// Skip wrapper methods
					if (
						functionName.includes("runOrchestrated") ||
						functionName.includes("orchestrate") ||
						functionName.includes("runSecure")
					) {
						return;
					}

					if (!isObservabilityFunction) {
						context.report({
							node: node.key || node.id || node,
							messageId: "encourageCompliantPatterns",
							data: {},
						});
					}
				}
			},
		};
	},
};
