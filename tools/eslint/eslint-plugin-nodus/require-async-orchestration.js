/**
 * @file Rule to enforce that all async functions use AsyncOrchestrator or approved wrapper patterns
 * @copyright 2024 Nodus
 * @version 2.2.0 - Updated to properly recognize production wrapper patterns and allowlist
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

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce that async functions use AsyncOrchestrator for instrumentation, including wrapper patterns",
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
					recognizeWrappers: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			notOrchestrated:
				"Async function is not orchestrated. Use orchestrator.run(), #runOrchestrated wrapper, or add to ESLint allowlist.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set([
			...(options.allowIn || []),
			...(globalAllowlist.allowUnorchestratedAsync || []),
			...(globalAllowlist.wrapperPatternFiles || []),
		]);
		const recognizeWrappers = options.recognizeWrappers !== false;

		/**
		 * Enhanced patterns that indicate proper orchestration - Updated for EmbeddingManager patterns
		 */
		const ORCHESTRATION_PATTERNS = [
			// Direct orchestrator usage
			/orchestrator\.run\(/,
			/\.createRunner\(/,
			/AsyncOrchestrator\.run\(/,
			/asyncOrchestrator\.(run|wrap)\(/,
			/this\.#managers\.asyncOrchestrator/,
			/this\.#managers\?.asyncOrchestrator/,

			// Production wrapper patterns (key patterns from EmbeddingManager)
			/\.#runOrchestrated\(/,
			/#runOrchestrated\(/,
			/this\.#runOrchestrated\(/,
			/return\s+this\.#runOrchestrated\(/,
			/await\s+this\.#runOrchestrated\(/,

			// Service-specific wrappers
			/\.#runSecure\(/,
			/\.#runWithPolicy\(/,
			/\.#orchestrate\(/,

			// Runner creation patterns
			/\.wrap\(/,
			/createRunner\(/,
			/\.runner\(/,

			// Return orchestrated operations
			/return\s+.*\.run\(/,
			/return\s+.*\.createRunner\(/,
			/return\s+.*orchestrator/,

			// Class-based wrapper patterns (for EmbeddingManager-style classes)
			/class\s+\w+.*\{[\s\S]*#runOrchestrated/,
			/async\s+#runOrchestrated\(/,
		];

		/**
		 * Check if function uses orchestration patterns - Enhanced for wrapper recognition
		 */
		function isOrchestrated(functionNode, sourceCode) {
			const functionText = sourceCode.getText(functionNode);

			// Direct pattern matching
			if (
				ORCHESTRATION_PATTERNS.some((pattern) =>
					pattern.test(functionText)
				)
			) {
				return true;
			}

			// Check if this function calls the wrapper method
			if (/return\s+this\.#runOrchestrated\(/.test(functionText)) {
				return true;
			}

			// Check if this IS the wrapper method (should be allowed)
			const functionName =
				functionNode.id?.name || functionNode.key?.name || "";
			if (
				functionName === "#runOrchestrated" ||
				functionName === "runOrchestrated"
			) {
				return true;
			}

			// Check for wrapper delegation patterns
			if (recognizeWrappers) {
				// Function that delegates to orchestrated wrapper
				if (
					/return\s+this\.#\w+\(/.test(functionText) &&
					functionText.includes("orchestrat")
				) {
					return true;
				}

				// Function that calls orchestrated methods
				if (/await\s+this\.#\w+Orchestrated\(/.test(functionText)) {
					return true;
				}

				// Method in a class that has #runOrchestrated wrapper
				const classNode = getContainingClass(functionNode);
				if (classNode) {
					const classText = sourceCode.getText(classNode);
					if (/#runOrchestrated\s*\(/.test(classText)) {
						// This class has the wrapper, so methods that use it are compliant
						if (/this\.#runOrchestrated\(/.test(functionText)) {
							return true;
						}
					}
				}
			}

			return false;
		}

		/**
		 * Find containing class for a function node
		 */
		function getContainingClass(node) {
			let current = node.parent;
			while (current) {
				if (
					current.type === "ClassDeclaration" ||
					current.type === "ClassExpression"
				) {
					return current;
				}
				current = current.parent;
			}
			return null;
		}

		/**
		 * Check if this is a utility/helper function that doesn't need orchestration
		 */
		function isUtilityFunction(functionNode, sourceCode) {
			const functionText = sourceCode.getText(functionNode);
			const functionName =
				functionNode.id?.name || functionNode.key?.name || "";

			// Helper function patterns
			const utilityPatterns = [
				// Private helper methods
				/^#\w+/,
				// Getter/setter patterns
				/^(get|set)[A-Z]/,
				// Validation functions
				/^(validate|check|verify|sanitize|normalize)/i,
				// Event handlers without business logic
				/^(on[A-Z]|handle[A-Z])/,
				// Simple transforms
				/^(parse|format|convert|transform)/i,
			];

			if (utilityPatterns.some((pattern) => pattern.test(functionName))) {
				return true;
			}

			// Functions that only do synchronous work
			if (
				!/await\s/.test(functionText) &&
				!/\.then\(/.test(functionText) &&
				!/Promise\./.test(functionText)
			) {
				return true;
			}

			// Very short functions (likely utilities)
			if (functionText.split("\n").length <= 5) {
				return true;
			}

			return false;
		}

		/**
		 * Check if function is in an allowed context - Enhanced for wrapper pattern files
		 */
		function isAllowedContext(filename, _functionNode) {
			const normalizedFilename = filename.replace(/\\/g, "/");

			// File-level allowlist
			if (
				Array.from(allowIn).some((allowedPath) =>
					normalizedFilename.includes(allowedPath)
				)
			) {
				return true;
			}

			// Check if this is a wrapper pattern file (like EmbeddingManager)
			const wrapperFiles = globalAllowlist.wrapperPatternFiles || [];
			if (
				wrapperFiles.some((file) => normalizedFilename.includes(file))
			) {
				return true;
			}

			// Specific file patterns that don't need orchestration
			const allowedFilePatterns = [
				/\/tests?\//,
				/\.test\./,
				/\.spec\./,
				/\/mocks?\//,
				/\/utils?\//,
				/\/helpers?\//,
				/\/bootstrap\//,
				/\/config\//,
				/Orchestrator\.js$/,
				/ActionDispatcher\.js$/,
			];

			return allowedFilePatterns.some((pattern) =>
				pattern.test(normalizedFilename)
			);
		}

		return {
			// Check async function declarations
			"FunctionDeclaration[async=true]"(node) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();

				if (isAllowedContext(filename, node)) {
					return;
				}

				if (isUtilityFunction(node, sourceCode)) {
					return;
				}

				if (!isOrchestrated(node, sourceCode)) {
					context.report({
						node,
						messageId: "notOrchestrated",
					});
				}
			},

			// Check async method definitions
			"MethodDefinition[value.async=true]"(node) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();

				if (isAllowedContext(filename, node)) {
					return;
				}

				if (isUtilityFunction(node, sourceCode)) {
					return;
				}

				if (!isOrchestrated(node.value, sourceCode)) {
					context.report({
						node: node.key,
						messageId: "notOrchestrated",
					});
				}
			},

			// Check async arrow functions
			"ArrowFunctionExpression[async=true]"(node) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();

				if (isAllowedContext(filename, node)) {
					return;
				}

				// Skip simple arrow functions
				if (node.body.type !== "BlockStatement") {
					return;
				}

				if (isUtilityFunction(node, sourceCode)) {
					return;
				}

				if (!isOrchestrated(node, sourceCode)) {
					context.report({
						node,
						messageId: "notOrchestrated",
					});
				}
			},

			// Check async function expressions
			"FunctionExpression[async=true]"(node) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();

				if (isAllowedContext(filename, node)) {
					return;
				}

				if (isUtilityFunction(node, sourceCode)) {
					return;
				}

				if (!isOrchestrated(node, sourceCode)) {
					context.report({
						node,
						messageId: "notOrchestrated",
					});
				}
			},
		};
	},
};
