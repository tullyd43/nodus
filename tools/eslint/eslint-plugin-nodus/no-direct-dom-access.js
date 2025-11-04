const FORBIDDEN_GLOBALS = new Set([
	"document",
	"window",
	"localStorage",
	"sessionStorage",
]);
const ALLOWED_FILES = [
	"src/features/ui/",
	"src/shared/lib/SafeDOM.js",
	"src/app/main.js", // Entry point
];

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow direct DOM/BOM access from platform code.",
		},
		messages: {
			noDirectDOM:
				"Direct access to '{{name}}' is forbidden. Use a canonical UI service or SafeDOM.",
		},
	},
	create(context) {
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = ALLOWED_FILES.some((path) => filename.includes(path));

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
