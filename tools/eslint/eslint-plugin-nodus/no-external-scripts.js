/**
 * @file Rule to prevent unverified external scripts and CDN dependencies
 * @copyright 2024 Nodus
 */

const FORBIDDEN_EXTERNAL_SOURCES = new Set([
	// CDN domains that bypass security controls
	"cdn.jsdelivr.net",
	"unpkg.com",
	"cdnjs.cloudflare.com",
	"googleapis.com",
	"googletagmanager.com",
	"google-analytics.com",
	"facebook.net",
	"twitter.com",
	"linkedin.com",

	// Dynamic script loading
	"eval(",
	"Function(",
	"importScripts(",
	"Worker(",
	"ServiceWorker(",
]);

const EXTERNAL_SCRIPT_PATTERNS = [
	// Script tag with external src
	/<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/i,

	// Dynamic script creation
	/createElement\s*\(\s*["']script["']\s*\)/,
	/\.createElement\s*\(\s*["']script["']\s*\)/,

	// External imports in dynamic imports
	/import\s*\(\s*["']https?:\/\/[^"']+["']\s*\)/,

	// Fetch to external domains without CDS
	/fetch\s*\(\s*["']https?:\/\/[^"']+["']/,
	/XMLHttpRequest/,

	// External resource loading
	/\.src\s*=\s*["']https?:\/\/[^"']+["']/,
	/\.href\s*=\s*["']https?:\/\/[^"']+["']/,
];

const ALLOWED_EXTERNAL_SOURCES = new Set([
	// Local development
	"localhost",
	"127.0.0.1",

	// Company domains (configure as needed)
	"nodus.dev",
	"nodus.com",

	// Approved security providers
	"security.nodus.dev",
]);

/**
 * Check if URL is from an allowed external source
 */
function isAllowedExternalSource(url) {
	try {
		const urlObj = new URL(url);
		return ALLOWED_EXTERNAL_SOURCES.has(urlObj.hostname);
	} catch {
		return false;
	}
}

/**
 * Extract URL from string literal
 */
function extractUrl(node) {
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node.type === "TemplateLiteral" && node.quasis.length === 1) {
		return node.quasis[0].value.cooked;
	}
	return null;
}

/**
 * Check if code uses CDS transport
 */
function usesCdsTransport(sourceCode, node) {
	const text = sourceCode.getText(node.parent || node);
	return /CDS\.fetch|cdsTransport|__NODUS_CDS_TRANSPORT__/.test(text);
}

/**
 * Check for external script patterns in string content
 */
function hasExternalScriptPattern(text) {
	return EXTERNAL_SCRIPT_PATTERNS.some((pattern) => pattern.test(text));
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Prevent unverified external scripts and enforce CDS transport for network calls",
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
					allowedDomains: {
						type: "array",
						items: { type: "string" },
					},
					requireCds: {
						type: "boolean",
						default: true,
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			externalScript:
				"External script from '{{source}}' is forbidden. Use local assets or CDS transport for verified external resources.",
			forbiddenDomain:
				"Domain '{{domain}}' is in the forbidden list. Use approved domains or local resources.",
			dynamicScriptCreation:
				"Dynamic script creation detected. Use static imports or CDS transport for external resources.",
			externalFetchWithoutCds:
				"External fetch without CDS transport detected. Use CDS.fetch() for all external network calls.",
			unsafeScriptPattern:
				"Unsafe script pattern detected: {{pattern}}. Use secure alternatives.",
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(
			options.allowIn || ["tests/", "src/devtools/", "scripts/build/"]
		);
		const allowedDomains = new Set([
			...ALLOWED_EXTERNAL_SOURCES,
			...(options.allowedDomains || []),
		]);
		const requireCds = options.requireCds !== false;

		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some((path) =>
			filename.includes(path)
		);

		if (isAllowed) {
			return {};
		}

		const sourceCode = context.getSourceCode();

		return {
			// Check import statements for external URLs
			ImportDeclaration(node) {
				const source = node.source.value;
				if (typeof source === "string" && source.startsWith("http")) {
					const url = new URL(source);
					// Allow certain approved external sources via helper
					if (isAllowedExternalSource(source)) {
						return;
					}
					if (FORBIDDEN_EXTERNAL_SOURCES.has(url.hostname)) {
						context.report({
							node: node.source,
							messageId: "forbiddenDomain",
							data: { domain: url.hostname },
						});
					} else if (!allowedDomains.has(url.hostname)) {
						context.report({
							node: node.source,
							messageId: "externalScript",
							data: { source: url.hostname },
						});
					}
				}
			},

			// Check dynamic imports
			CallExpression(node) {
				// Dynamic import() calls
				if (
					node.callee.type === "Import" &&
					node.arguments.length > 0
				) {
					const url = extractUrl(node.arguments[0]);
					if (url && url.startsWith("http")) {
						try {
							const urlObj = new URL(url);
							if (
								FORBIDDEN_EXTERNAL_SOURCES.has(urlObj.hostname)
							) {
								context.report({
									node: node.arguments[0],
									messageId: "forbiddenDomain",
									data: { domain: urlObj.hostname },
								});
							} else if (!allowedDomains.has(urlObj.hostname)) {
								context.report({
									node: node.arguments[0],
									messageId: "externalScript",
									data: { source: urlObj.hostname },
								});
							}
						} catch {
							// Invalid URL, let other rules handle it
						}
					}
				}

				// Check fetch calls
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "fetch" &&
					node.arguments.length > 0
				) {
					const url = extractUrl(node.arguments[0]);
					if (url && url.startsWith("http")) {
						if (requireCds && !usesCdsTransport(sourceCode, node)) {
							context.report({
								node: node.arguments[0],
								messageId: "externalFetchWithoutCds",
								data: {},
							});
						}
					}
				}

				// Check createElement('script')
				if (
					node.callee.type === "MemberExpression" &&
					node.callee.property.name === "createElement" &&
					node.arguments.length > 0
				) {
					const elementType = extractUrl(node.arguments[0]);
					if (elementType === "script") {
						context.report({
							node,
							messageId: "dynamicScriptCreation",
							data: {},
						});
					}
				}
			},

			// Check assignment expressions for script.src assignments
			AssignmentExpression(node) {
				if (
					node.left.type === "MemberExpression" &&
					node.left.property.name === "src"
				) {
					const url = extractUrl(node.right);
					if (url && url.startsWith("http")) {
						try {
							const urlObj = new URL(url);
							if (
								FORBIDDEN_EXTERNAL_SOURCES.has(urlObj.hostname)
							) {
								context.report({
									node: node.right,
									messageId: "forbiddenDomain",
									data: { domain: urlObj.hostname },
								});
							} else if (!allowedDomains.has(urlObj.hostname)) {
								context.report({
									node: node.right,
									messageId: "externalScript",
									data: { source: urlObj.hostname },
								});
							}
						} catch {
							// Invalid URL
						}
					}
				}
			},

			// Check string literals for external script patterns
			Literal(node) {
				if (typeof node.value === "string") {
					if (hasExternalScriptPattern(node.value)) {
						context.report({
							node,
							messageId: "unsafeScriptPattern",
							data: { pattern: "External script in HTML string" },
						});
					}
				}
			},

			// Check template literals for external script patterns
			TemplateLiteral(node) {
				const text = node.quasis
					.map((q) => q.value.cooked)
					.join("${...}");
				if (hasExternalScriptPattern(text)) {
					context.report({
						node,
						messageId: "unsafeScriptPattern",
						data: {
							pattern: "External script in template literal",
						},
					});
				}
			},
		};
	},
};
