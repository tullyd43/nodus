/**
 * @file Rule to enforce ActionDispatcher usage for synchronous operations and state mutations
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

const STATE_MUTATION_OPERATIONS = new Set([
	// Core state mutations
	"put",
	"set",
	"update",
	"delete",
	"remove",
	"save",
	"create",
	"upsert",
	"insert",
	"modify",
	"destroy",
	"patch",
	"replace",

	// UI state operations
	"toggle",
	"show",
	"hide",
	"open",
	"close",
	"expand",
	"collapse",
	"enable",
	"disable",
	"activate",
	"deactivate",
	"select",
	"deselect",

	// Entity operations
	"addEntity",
	"removeEntity",
	"updateEntity",
	"createEntity",
	"saveEntity",
	"deleteEntity",
	"modifyEntity",

	// Cache operations (should go through ForensicRegistry + ActionDispatcher)
	"clearCache",
	"invalidateCache",
	"refreshCache",

	// Workflow operations
	"startWorkflow",
	"completeWorkflow",
	"cancelWorkflow",
	"updateWorkflowState",
	"transitionWorkflow",
]);

// Enhanced ActionDispatcher patterns including EmbeddingManager usage
const ACTIONDISPATCHER_PATTERNS = [
	// Direct ActionDispatcher usage
	/actionDispatcher\.dispatch\(/,
	/\.actionDispatcher\.dispatch\(/,
	/managers\.actionDispatcher\.dispatch\(/,
	/\.managers\.actionDispatcher\.dispatch\(/,
	/stateManager\.managers\.actionDispatcher\.dispatch\(/,
	/this\.#stateManager\.managers\.actionDispatcher\.dispatch\(/,

	// Declarative UI patterns
	/data-action\s*=\s*["'][^"']+["']/,
	/setAttribute\s*\(\s*["']data-action["']/,

	// Wrapper patterns that delegate to ActionDispatcher
	/\.#dispatchAction\(/,
	/\.#dispatch\(/,
	/this\.#dispatchAction\(/,
	/this\.#dispatch\(/,

	// EmbeddingManager-style wrapper patterns
	/\.#runOrchestrated\(/,
	/this\.#runOrchestrated\(/,
	/return\s+this\.#runOrchestrated\(/,
	/await\s+this\.#runOrchestrated\(/,
];

const DIRECT_STORAGE_PATTERNS = [
	// Direct storage access that should go through ActionDispatcher
	/stateManager\.storage\.(put|set|update|delete|save|create|upsert)/,
	/\.managers\.storage\.(put|set|update|delete|save|create|upsert)/,
	/storage\.instance\.(put|set|update|delete|save|create|upsert)/,
	/\.storage\.(put|set|update|delete|save|create|upsert)/,

	// Direct database operations
	/database\.(insert|update|delete|save|create|upsert)/,
	/db\.(insert|update|delete|save|create|upsert)/,

	// Direct state mutations
	/state\.(set|update|patch|merge)/,
	/\.state\.(set|update|patch|merge)/,
];

const DIRECT_CACHE_PATTERNS = [
	// Direct cache mutations (should go through ForensicRegistry)
	/cache\.(set|put|delete|clear|invalidate)/,
	/\.cache\.(set|put|delete|clear|invalidate)/,
	/cacheManager\.(set|put|delete|clear|invalidate)/,
	/\.cacheManager\.(set|put|delete|clear|invalidate)/,
];

const UI_MUTATION_PATTERNS = [
	// Direct DOM mutations (should be declarative)
	/\.style\.[^=]*=/,
	/\.classList\.(add|remove|toggle)/,
	/\.setAttribute\(/,
	/\.removeAttribute\(/,
	/\.textContent\s*=/,
	/\.innerHTML\s*=/,
	/\.outerHTML\s*=/,
	/\.value\s*=/,
	/\.checked\s*=/,
	/\.disabled\s*=/,
	/\.hidden\s*=/,
];

// Enhanced compliant patterns including wrapper recognition
const COMPLIANT_PATTERNS = [
	// ActionDispatcher usage
	...ACTIONDISPATCHER_PATTERNS,

	// ForensicRegistry for cache operations
	/forensicRegistry\.wrapOperation\(/,
	/\.forensicRegistry\.wrapOperation\(/,

	// Auto-instrumented storage paths
	/stateManager\.managers\.storage/,
	/\.managers\.storage/,

	// Wrapper methods that delegate properly (EmbeddingManager patterns)
	/return\s+.*\.dispatch\(/,
	/await\s+.*\.dispatch\(/,
	/this\.#runOrchestrated\(/,
	/\.#runOrchestrated\(/,
	/#runOrchestrated\(/,

	// HybridStateManager patterns
	/this\.#stateManager\.managers\./,
	/this\.#managers\./,
];

/**
 * Check if operation is a state mutation
 */
function isStateMutationOperation(methodName) {
	return STATE_MUTATION_OPERATIONS.has(methodName);
}

/**
 * Check if code uses ActionDispatcher properly - Enhanced for wrapper patterns
 */
function _usesActionDispatcher(sourceCode, node) {
	const functionText = sourceCode.getText(node);
	return ACTIONDISPATCHER_PATTERNS.some((pattern) =>
		pattern.test(functionText)
	);
}

/**
 * Check if code uses direct storage access
 */
function usesDirectStorage(sourceCode, node) {
	const functionText = sourceCode.getText(node);
	return DIRECT_STORAGE_PATTERNS.some((pattern) =>
		pattern.test(functionText)
	);
}

/**
 * Check if code uses direct cache access
 */
function usesDirectCache(sourceCode, node) {
	const functionText = sourceCode.getText(node);
	return DIRECT_CACHE_PATTERNS.some((pattern) => pattern.test(functionText));
}

/**
 * Check if code uses direct UI mutations
 */
function usesDirectUIMutation(sourceCode, node) {
	const functionText = sourceCode.getText(node);
	return UI_MUTATION_PATTERNS.some((pattern) => pattern.test(functionText));
}

/**
 * Check if code uses compliant patterns - Enhanced for wrapper recognition
 */
function usesCompliantPattern(sourceCode, node) {
	const functionText = sourceCode.getText(node);
	return COMPLIANT_PATTERNS.some((pattern) => pattern.test(functionText));
}

/**
 * Get containing function for context analysis
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
 * Check if this is in an allowed context - Enhanced with allowlist support
 */
function isAllowedContext(filename) {
	const allowedContexts = [
		// Core implementation files
		"ActionDispatcher.js",
		"ForensicRegistry.js",
		"StateUIBridge.js",
		"BindEngine.js",

		// Storage adapters and infrastructure
		"storage/adapters/",
		"storage/implementations/",
		"platform/bootstrap/",
		"platform/observability/",

		// Development and testing
		"tests/",
		"test/",
		"spec/",
		"devtools/",
		"scripts/",
		"mocks/",

		// Specific allowed patterns
		"__tests__",
		".test.",
		".spec.",

		// Global allowlist categories
		...(globalAllowlist.wrapperPatternFiles || []),
		...(globalAllowlist.actionDispatcherExempt || []),
		...(globalAllowlist.allowDirectStorage || []),
		...(globalAllowlist.allowDirectCache || []),
		...(globalAllowlist.allowDirectDOM || []),
	];

	const normalizedFilename = filename.replace(/\\/g, "/");
	return allowedContexts.some((context) =>
		normalizedFilename.includes(context)
	);
}

/**
 * Determine operation category for better error messages
 */
function categorizeOperation(methodName, node, sourceCode) {
	const text = sourceCode.getText(node);

	if (/cache|Cache/.test(text)) {
		return "cache";
	}
	if (/storage|Storage|database|Database/.test(text)) {
		return "storage";
	}
	if (/ui|UI|dom|DOM|element|Element/.test(text)) {
		return "ui";
	}
	if (STATE_MUTATION_OPERATIONS.has(methodName)) {
		return "state";
	}

	return "operation";
}

/**
 * Check if we're in a wrapper pattern class
 */
function isInWrapperClass(node, sourceCode) {
	let current = node.parent;
	while (current) {
		if (current.type === "ClassDeclaration") {
			const classText = sourceCode.getText(current);
			if (/#runOrchestrated|#runSecure|#orchestrate/.test(classText)) {
				return true;
			}
		}
		current = current.parent;
	}
	return false;
}

/**
 * Determine if the current node is wrapped by a known helper call (maybeWrap, #wrapOperation, #withModuleCache)
 */
function isWrappedByHelper(node, sourceCode) {
	let current = node.parent;
	while (current) {
		if (current.type === "CallExpression") {
			try {
				const callText = sourceCode.getText(current);
				if (
					/(wrapOperation|maybeWrap|sharedMaybeWrap|#wrapOperation|#withModuleCache|withModuleCache)\s*\(/.test(
						callText
					)
				) {
					return true;
				}
			} catch {
				// ignore
			}
		}
		// Also consider function expressions/arrow functions that are passed
		// as arguments to wrapper calls (e.g. sharedMaybeWrap(..., () => obj.set(...))).
		if (
			(current.type === "ArrowFunctionExpression" ||
				current.type === "FunctionExpression" ||
				current.type === "FunctionDeclaration") &&
			current.parent &&
			current.parent.type === "CallExpression"
		) {
			try {
				const parentCallText = sourceCode.getText(current.parent);
				if (
					/(wrapOperation|maybeWrap|sharedMaybeWrap|#wrapOperation|#withModuleCache|withModuleCache)\s*\(/.test(
						parentCallText
					)
				) {
					return true;
				}
			} catch {
				// ignore
			}
		}
		current = current.parent;
	}
	return false;
}

/**
 * Heuristic: detect when a separately-declared function is passed into a wrapper helper
 */
function isFunctionPassedToWrapper(node, sourceCode) {
	if (!node) return false;
	let identifier = null;
	if (node.type === "FunctionDeclaration" && node.id?.name) {
		identifier = node.id.name;
	} else if (
		(node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression") &&
		node.parent &&
		node.parent.type === "VariableDeclarator" &&
		node.parent.id &&
		node.parent.id.name
	) {
		identifier = node.parent.id.name;
	}
	if (!identifier) return false;
	const fileText = sourceCode.getText();
	const pattern = new RegExp(
		"(?:maybeWrap|sharedMaybeWrap|wrapOperation|#wrapOperation|withModuleCache|#withModuleCache)\\s*\\([^)]*\\b" +
			identifier +
			"\\b[^)]*\\)",
		"m"
	);
	return pattern.test(fileText);
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce ActionDispatcher usage for state mutations and ForensicRegistry for cache operations",
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
					enforceStorage: {
						type: "boolean",
						default: true,
					},
					enforceCache: {
						type: "boolean",
						default: true,
					},
					enforceUI: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingActionDispatcher:
				"{{category}} operation '{{operation}}' should use ActionDispatcher. Use: actionDispatcher.dispatch('{{suggestedAction}}', payload)",
			directStorageAccess:
				"Direct storage access '{{method}}' bypasses observability. Use ActionDispatcher: actionDispatcher.dispatch('entity.{{method}}', data)",
			directCacheAccess:
				"Direct cache access '{{method}}' bypasses security. Use ForensicRegistry: forensicRegistry.wrapOperation('cache', '{{method}}', ...)",
			directUIMutation:
				"Direct UI mutation bypasses declarative architecture. Use: <element data-action='ui.{{action}}' data-context='{{context}}'>",
			missingDeclarativeAction:
				"Interactive UI element should use data-action attribute for observability and consistency.",
			useCompliantPattern:
				"Use ActionDispatcher, ForensicRegistry, or other compliant patterns for '{{operation}}' operations.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set([
			...(options.allowIn || []),
			...(globalAllowlist.wrapperPatternFiles || []),
		]);
		const enforceStorage = options.enforceStorage !== false;
		const enforceCache = options.enforceCache !== false;
		const enforceUI = options.enforceUI !== false;

		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed =
			isAllowedContext(filename) ||
			Array.from(allowIn).some((path) => filename.includes(path));

		if (isAllowed) {
			return {};
		}

		const sourceCode = context.getSourceCode();

		return {
			// Check method calls for state mutations
			CallExpression(node) {
				// Ignore operations on known in-memory maps (subscriptions, pendingRequests)
				const nodeText = sourceCode.getText(node);
				const localMapNames =
					/(?:this\.)?#?(subscriptions|pendingRequests|messageQueue|_bootstrapCache)/;
				if (localMapNames.test(nodeText)) return;

				// Ignore operations on local resources such as the WebSocket connection or
				// heartbeat timers which are module-local and shouldn't require ActionDispatcher
				const localResourceNames =
					/(?:this\.)?#?(connection|heartbeatInterval|_socket|socket)/;
				if (localResourceNames.test(nodeText)) return;
				let methodName = null;
				if (
					node.callee.type === "MemberExpression" &&
					node.callee.property.type === "Identifier"
				) {
					methodName = node.callee.property.name;
				} else if (node.callee.type === "Identifier") {
					methodName = node.callee.name;
				}

				if (!methodName) return;

				const category = categorizeOperation(
					methodName,
					node,
					sourceCode
				);
				const containingFunction = getContainingFunction(node);

				// If we're in a wrapper pattern class, be more lenient
				if (isInWrapperClass(node, sourceCode)) {
					return;
				}

				// Check for direct storage access
				if (enforceStorage && usesDirectStorage(sourceCode, node)) {
					context.report({
						node,
						messageId: "directStorageAccess",
						data: { method: methodName },
					});
					return;
				}

				// Check for direct cache access
				if (enforceCache && usesDirectCache(sourceCode, node)) {
					context.report({
						node,
						messageId: "directCacheAccess",
						data: { method: methodName },
					});
					return;
				}

				// Check for state mutation operations
				if (isStateMutationOperation(methodName)) {
					// If the node is already wrapped by a recognized helper (maybeWrap, #wrapOperation)
					// treat it as compliant since the helper will enforce observability.
					if (
						isWrappedByHelper(node, sourceCode) ||
						isFunctionPassedToWrapper(
							containingFunction,
							sourceCode
						)
					) {
						return;
					}
					if (
						containingFunction &&
						!usesCompliantPattern(sourceCode, containingFunction)
					) {
						const suggestedAction =
							category === "cache"
								? `cache.${methodName}`
								: category === "storage"
									? `entity.${methodName}`
									: category === "ui"
										? `ui.${methodName}`
										: `${category}.${methodName}`;

						context.report({
							node,
							messageId: "missingActionDispatcher",
							data: {
								operation: methodName,
								category: category,
								suggestedAction: suggestedAction,
							},
						});
					}
				}
			},

			// Check for direct UI mutations - but skip wrapper classes
			MemberExpression(node) {
				if (!enforceUI) return;

				// Skip if in wrapper class
				if (isInWrapperClass(node, sourceCode)) {
					return;
				}

				if (usesDirectUIMutation(sourceCode, node)) {
					const propertyName = node.property?.name || "property";
					let actionSuggestion = "update";
					let contextSuggestion = "{}";

					// Provide specific suggestions based on property
					if (propertyName === "style") {
						actionSuggestion = "setStyle";
						contextSuggestion =
							'{"property": "...", "value": "..."}';
					} else if (propertyName === "classList") {
						actionSuggestion = "toggleClass";
						contextSuggestion = '{"className": "..."}';
					} else if (
						propertyName === "textContent" ||
						propertyName === "innerHTML"
					) {
						actionSuggestion = "setContent";
						contextSuggestion = '{"content": "..."}';
					}

					context.report({
						node,
						messageId: "directUIMutation",
						data: {
							action: actionSuggestion,
							context: contextSuggestion,
						},
					});
				}
			},

			// Check assignment expressions for state mutations - but skip wrapper classes
			AssignmentExpression(node) {
				if (node.left.type === "MemberExpression") {
					const propertyName = node.left.property?.name;

					// Skip if in wrapper class
					if (isInWrapperClass(node, sourceCode)) {
						return;
					}

					// Check for state property assignments
					if (
						propertyName &&
						/^(state|data|value|content)$/i.test(propertyName)
					) {
						const containingFunction = getContainingFunction(node);
						if (
							containingFunction &&
							!usesCompliantPattern(
								sourceCode,
								containingFunction
							)
						) {
							context.report({
								node,
								messageId: "useCompliantPattern",
								data: {
									operation: `${propertyName} assignment`,
								},
							});
						}
					}
				}
			},

			// Check HTML-like content for missing data-action attributes - but skip wrapper classes
			Literal(node) {
				if (!enforceUI || typeof node.value !== "string") return;

				// Skip if in wrapper class
				if (isInWrapperClass(node, sourceCode)) {
					return;
				}

				const htmlContent = node.value;
				const hasInteractiveElement =
					/<(button|a|input|select|textarea|form)[^>]*>/i.test(
						htmlContent
					);
				const hasDataAction = /data-action\s*=\s*["'][^"']+["']/i.test(
					htmlContent
				);

				if (hasInteractiveElement && !hasDataAction) {
					context.report({
						node,
						messageId: "missingDeclarativeAction",
						data: {},
					});
				}
			},

			// Check template literals for missing data-action attributes - but skip wrapper classes
			TemplateLiteral(node) {
				if (!enforceUI) return;

				// Skip if in wrapper class
				if (isInWrapperClass(node, sourceCode)) {
					return;
				}

				const templateContent = node.quasis
					.map((q) => q.value.cooked)
					.join("${...}");
				const hasInteractiveElement =
					/<(button|a|input|select|textarea|form)[^>]*>/i.test(
						templateContent
					);
				const hasDataAction = /data-action\s*=\s*["'][^"']+["']/i.test(
					templateContent
				);

				if (hasInteractiveElement && !hasDataAction) {
					context.report({
						node,
						messageId: "missingDeclarativeAction",
						data: {},
					});
				}
			},
		};
	},
};
