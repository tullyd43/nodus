/**
 * @file Rule to enforce that all async functions are wrapped by the AsyncOrchestrator.
 * @copyright 2024 Nodus
 */

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce that async functions use the AsyncOrchestrator for instrumentation.",
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
				},
				additionalProperties: false,
			},
		],
		messages: {
			notOrchestrated:
				"Async function is not orchestrated. Wrap it in `orchestrator.run()` to ensure proper auditing, metrics, and policy enforcement.",
		},
	},
	create(context) {
		const allowIn = new Set(context.options[0]?.allowIn || []);

		return {
			"FunctionDeclaration[async=true], ArrowFunctionExpression[async=true], FunctionExpression[async=true]"(
				node
			) {
				const filename = context.getFilename();
				if (
					allowIn.some((allowedPath) =>
						filename.includes(allowedPath)
					)
				) {
					return;
				}

				const sourceCode = context.getSourceCode().getText(node.parent);
				if (
					!sourceCode.includes("orchestrator.run") &&
					!sourceCode.includes("AsyncHelper.wrap")
				) {
					context.report({ node, messageId: "notOrchestrated" });
				}
			},
		};
	},
};
