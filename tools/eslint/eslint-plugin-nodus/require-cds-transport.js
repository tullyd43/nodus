/**
 * @file Rule to enforce CDS transport usage for all network operations
 * @copyright 2024 Nodus
 */

const NETWORK_APIS = new Set([
	"fetch",
	"XMLHttpRequest",
	"xhr",
	"ajax",
	"WebSocket",
	"EventSource",
	"sendBeacon",
]);

const CDS_TRANSPORT_PATTERNS = [
	/CDS\.fetch/,
	/cdsTransport/,
	/__NODUS_CDS_TRANSPORT__/,
	/createProxyTransport/,
	/createDefaultTransport/,
	/this\.#transport/,
	/this\.transport/,
];

const ALLOWED_NETWORK_CONTEXTS = [
	// Service worker contexts
	"sw.js",
	"service-worker.js",
	"worker.js",

	// CDS implementation files
	"CDS.js",
	"transport.js",
	"cds-transport.js",

	// Test files
	"test",
	"spec",
	".test.",
	".spec.",

	// Build/development tools
	"vite.config",
	"webpack.config",
	"build/",
	"scripts/",
];

/**
 * Check if current context is allowed to use raw network APIs
 */
function isAllowedNetworkContext(filename) {
	const normalized = filename.replace(/\\/g, "/");
	return ALLOWED_NETWORK_CONTEXTS.some((context) =>
		normalized.includes(context)
	);
}

/**
 * Check if code uses CDS transport
 */
function usesCdsTransport(sourceCode, node) {
	// Check the containing function/method for CDS transport usage
	let current = node;
	while (current && current.type !== "Program") {
		if (
			[
				"FunctionDeclaration",
				"FunctionExpression",
				"ArrowFunctionExpression",
				"MethodDefinition",
			].includes(current.type)
		) {
			const functionText = sourceCode.getText(current);
			if (
				CDS_TRANSPORT_PATTERNS.some((pattern) =>
					pattern.test(functionText)
				)
			) {
				return true;
			}
		}
		current = current.parent;
	}

	// Check the entire file for CDS transport setup
	const fullText = sourceCode.getText();
	return CDS_TRANSPORT_PATTERNS.some((pattern) => pattern.test(fullText));
}

/**
 * Check if this is a CDS transport implementation file
 */
function isCdsImplementationFile(sourceCode) {
	const text = sourceCode.getText();
	return /export.*Transport|class.*Transport|CDS.*implementation/i.test(text);
}

/**
 * Get the URL being accessed (if determinable)
 */
function getNetworkUrl(node) {
	if (node.arguments.length === 0) return null;

	const firstArg = node.arguments[0];
	if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
		return firstArg.value;
	}

	return null;
}

/**
 * Check if URL is external (requires CDS transport)
 */
function isExternalUrl(url) {
	if (!url) return false;

	// Relative URLs don't need CDS transport
	if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
		return false;
	}

	// localhost doesn't need CDS transport
	if (url.includes("localhost") || url.includes("127.0.0.1")) {
		return false;
	}

	// Absolute URLs need CDS transport
	return url.startsWith("http://") || url.startsWith("https://");
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce CDS transport usage for all network operations to maintain security and observability",
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
					allowLocalhost: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			requireCdsTransport:
				"Network operation '{{api}}' must use CDS transport. Replace with CDS.fetch() or configure transport.",
			externalWithoutCds:
				"External network call to '{{url}}' requires CDS transport for security and observability.",
			rawNetworkApi:
				"Raw network API '{{api}}' bypasses platform controls. Use CDS transport for all network operations.",
			missingTransportSetup:
				"File uses network operations but no CDS transport configuration found.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || ALLOWED_NETWORK_CONTEXTS);
		const strictMode = options.strictMode || false;
		const allowLocalhost = options.allowLocalhost !== false;

		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed =
			isAllowedNetworkContext(filename) ||
			Array.from(allowIn).some((path) => filename.includes(path));

		if (isAllowed) {
			return {};
		}

		const sourceCode = context.getSourceCode();

		// Skip CDS implementation files
		if (isCdsImplementationFile(sourceCode)) {
			return {};
		}

		let hasNetworkCalls = false;
		let hasCdsTransport = false;

		return {
			// Check fetch calls
			CallExpression(node) {
				if (
					node.callee.type === "Identifier" &&
					NETWORK_APIS.has(node.callee.name)
				) {
					hasNetworkCalls = true;

					const apiName = node.callee.name;
					const url = getNetworkUrl(node);

					// In strict mode, always require CDS transport
					if (strictMode) {
						if (!usesCdsTransport(sourceCode, node)) {
							context.report({
								node: node.callee,
								messageId: "requireCdsTransport",
								data: { api: apiName },
							});
						}
						return;
					}

					// For external URLs, require CDS transport
					if (isExternalUrl(url)) {
						if (!allowLocalhost || !url.includes("localhost")) {
							if (!usesCdsTransport(sourceCode, node)) {
								context.report({
									node: node.callee,
									messageId: "externalWithoutCds",
									data: {
										api: apiName,
										url: url || "unknown",
									},
								});
							}
						}
					}
				}

				// Check for CDS transport usage
				if (node.callee.type === "MemberExpression") {
					const objectName = node.callee.object.name;
					const propertyName = node.callee.property.name;

					if (objectName === "CDS" && propertyName === "fetch") {
						hasCdsTransport = true;
					}
				}
			},

			// Check instantiation of network-related classes (XMLHttpRequest, WebSocket, etc.)
			NewExpression(node) {
				if (node.callee && node.callee.type === "Identifier") {
					const name = node.callee.name;
					if (NETWORK_APIS.has(name) || name === "WebSocket") {
						hasNetworkCalls = true;
						// WebSocket needs URL handling for external checks
						if (name === "WebSocket") {
							const url = getNetworkUrl(node);
							if (
								isExternalUrl(url) &&
								(!allowLocalhost || !url.includes("localhost"))
							) {
								if (!usesCdsTransport(sourceCode, node)) {
									context.report({
										node: node.callee,
										messageId: "externalWithoutCds",
										data: {
											api: "WebSocket",
											url: url || "unknown",
										},
									});
								}
							}
						} else {
							// Other network APIs (XMLHttpRequest etc.)
							const apiName = name;
							if (
								strictMode ||
								!usesCdsTransport(sourceCode, node)
							) {
								context.report({
									node: node.callee,
									messageId: "rawNetworkApi",
									data: { api: apiName },
								});
							}
						}
					}
				}
			},

			// Final check: if file has network calls but no CDS transport, warn
			"Program:exit"() {
				if (
					hasNetworkCalls &&
					!hasCdsTransport &&
					!usesCdsTransport(sourceCode, { parent: null })
				) {
					// Only report this in strict mode to avoid too many warnings
					if (strictMode) {
						context.report({
							node:
								context.getSourceCode().ast.body[0] ||
								context.getSourceCode().ast,
							messageId: "missingTransportSetup",
							data: {},
						});
					}
				}
			},
		};
	},
};
