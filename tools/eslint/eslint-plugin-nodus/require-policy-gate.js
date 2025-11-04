/**
 * @file Rule ensuring security-sensitive modules gate operations through PolicyControlBlock.
 * Flags files such as SecurityManager or PolicyControlBlock implementations when they do not
 * reference the PolicyControlBlock helper, preventing bypass of the centralized policy gate.
 */

const DEFAULT_FILENAME_PATTERNS = [
	/\/SecurityManager/i,
	/PolicyControlBlock/i,
];

const DEFAULT_IDENTIFIER_PATTERNS = [
	/\bPolicyControlBlock\b/,
	/\bpolicyControlBlock\b/,
	/\bPolicyControlBlock_Enhanced\b/,
];

/**
 * Normalizes option values into regular expressions.
 * @param {Array<string|RegExp>} maybePatterns
 * @param {Array<RegExp>} fallback
 * @returns {Array<RegExp>}
 */
function normalizePatterns(maybePatterns, fallback) {
	if (!Array.isArray(maybePatterns) || maybePatterns.length === 0) {
		return fallback;
}
	return maybePatterns
		.map((pattern) => {
			if (pattern instanceof RegExp) return pattern;
			if (typeof pattern === "string" && pattern.length > 0) {
				return new RegExp(pattern);
			}
			return null;
		})
		.filter(Boolean);
}

/**
 * Ensures we always have at least one pattern after normalization.
 * @param {Array<string|RegExp>} maybePatterns
 * @param {Array<RegExp>} fallback
 * @returns {Array<RegExp>}
 */
function resolvePatterns(maybePatterns, fallback) {
	const normalized = normalizePatterns(maybePatterns, fallback);
	return normalized.length > 0 ? normalized : fallback;
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Security-sensitive modules must gate operations through PolicyControlBlock.",
			recommended: false,
		},
		schema: [
			{
				type: "object",
				properties: {
					filenamePatterns: {
						type: "array",
						items: { type: "string" },
					},
					identifierPatterns: {
						type: "array",
						items: { type: "string" },
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingPolicyGate:
				"Security-sensitive module must reference PolicyControlBlock (or equivalent gate). Ensure operations wrap with PolicyControlBlock.",
		},
	},
	create(context) {
		const filename = context.getFilename().replace(/\\/g, "/");
		const options = context.options?.[0] || {};

		const filenamePatterns = resolvePatterns(
			options.filenamePatterns,
			DEFAULT_FILENAME_PATTERNS
		);
		const identifierPatterns = resolvePatterns(
			options.identifierPatterns,
			DEFAULT_IDENTIFIER_PATTERNS
		);

		const shouldCheck = filenamePatterns.some((pattern) =>
			pattern.test(filename)
		);

		if (!shouldCheck) {
			return {};
		}

		return {
			Program(node) {
				const source = context.getSourceCode().text;
				const hasPolicyGate = identifierPatterns.some((pattern) =>
					pattern.test(source)
				);
				if (!hasPolicyGate) {
					context.report({
						node: node.body.length ? node.body[0] : node,
						messageId: "missingPolicyGate",
					});
				}
			},
		};
	},
};
