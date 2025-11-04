const SECURITY_METHODS = new Set([
	"canRead",
	"canWrite",
	"enforceNoReadUp",
	"enforceNoWriteDown",
	"compareClassifications",
]);

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow string literals for security classifications.",
		},
		messages: {
			noString:
				"Do not use string literals for classification. Use the canonical 'CLASSIFICATION' enum instead.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type !== "MemberExpression") return;

				const methodName = callee.property.name;
				if (!SECURITY_METHODS.has(methodName)) return;

				// Check arguments for string literals
				node.arguments.forEach((arg) => {
					if (arg.type === "Literal" && typeof arg.value === "string") {
						context.report({ node: arg, messageId: "noString" });
					}
				});
			},
		};
	},
};
