const FORBIDDEN_CALLS = new Set(["DOMPurify", "sanitize-html"]);
const ALLOWED_FILES = [
	"src/platform/security/Sanitizer.js", // The *only* file allowed to import them
];

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce use of the canonical Nodus Sanitizer.js module.",
		},
		messages: {
			useCanonical:
				"Do not use '{{name}}' directly. Import and use 'stateManager.managers.sanitizer.cleanse()'.",
		},
	},
	create(context) {
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = ALLOWED_FILES.some((path) => filename.includes(path));

		if (isAllowed) {
			return {};
		}

		return {
			ImportDeclaration(node) {
				if (FORBIDDEN_CALLS.has(node.source.value)) {
					context.report({
						node,
						messageId: "useCanonical",
						data: { name: node.source.value },
					});
				}
			},
			Identifier(node) {
				if (FORBIDDEN_CALLS.has(node.name)) {
					context.report({
						node,
						messageId: "useCanonical",
						data: { name: node.name },
					});
				}
			},
		};
	},
};
