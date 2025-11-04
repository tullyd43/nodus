const FORBIDDEN_GLOBALS = new Set([
	"document",
	"window",
	"localStorage",
	"sessionStorage",
]);

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow direct DOM/BOM access from platform code.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowIn: {
						type: "array",
						items: {
							type: "string",
						},
						default: [],
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			noDirectDOM:
				"Direct access to '{{name}}' is forbidden. Use a canonical UI service or SafeDOM.",
		},
	},
	create(context) {
		const filename = context.getFilename().replace(/\\/g, "/");
		const options = context.options[0] || {};
		const allowedFiles = options.allowIn || [];

		const isAllowed = allowedFiles.some((path) => filename.includes(path));

		if (isAllowed) {
			return {};
		}

		return {
			Identifier(node) {
				if (FORBIDDEN_GLOBALS.has(node.name)) {
					context.report({
						node,
						messageId: "noDirectDOM",
						data: { name: node.name },
					});
				}
			},
		};
	},
};
