/**
 * @fileoverview Enforces that performance-critical functions and expressions
 * include explicit performance budget comments.
 *
 * Accepted comment formats (must be immediately above the node):
 *   /** @performance budget: <10ms *\/
 *   // @performance-budget: 10ms
 *   /* PERFORMANCE_BUDGET: 10ms *\/
 */

"use strict";

const PERFORMANCE_BUDGET_COMMENTS = [
	/\/\*\*?\s*@performance\s+budget:\s*([^*]+)\*\//i,
	/\/\/\s*@performance-budget:\s*(.+)$/im,
	/\/\*\s*PERFORMANCE_BUDGET:\s*([^*]+)\*\//i,
];

/**
 * Extract a performance budget comment immediately preceding a node.
 */
function getPerformanceBudget(sourceCode, node) {
	const nodesToCheck = [
		node,
		node && node.parent,
		node && node.parent && node.parent.parent,
	].filter(Boolean);

	for (const n of nodesToCheck) {
		const comments = sourceCode.getCommentsBefore(n);
		for (const comment of comments) {
			// FIX: Get the full comment including delimiters
			const raw = sourceCode.getText(comment);

			// Also try to reconstruct the full comment if getText() strips delimiters
			const fullComment =
				comment.type === "Block" ? `/*${raw}*/` : `//${raw}`;

			for (const pattern of PERFORMANCE_BUDGET_COMMENTS) {
				const match = raw.match(pattern) || fullComment.match(pattern);
				if (match) {
					return match[1].trim();
				}
			}
		}
	}
	return null;
}

export default {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require explicit performance-budget comments on performance-critical operations.",
			category: "Performance",
			recommended: false,
		},
		schema: [],
		messages: {
			missingBudget:
				"Performance-critical operation '{{name}}' missing performance budget comment. Add: /* @performance-budget: <X>ms */",
		},
	},

	create(context) {
		const sourceCode = context.getSourceCode();

		function checkNode(node, name) {
			const budget = getPerformanceBudget(sourceCode, node);
			if (!budget) {
				context.report({
					node,
					messageId: "missingBudget",
					data: { name },
				});
			}
		}

		//----------------------------------------------------------------------
		// Visitors
		//----------------------------------------------------------------------

		return {
			// Function declarations or named methods
			"FunctionDeclaration[id.name=/^(execute|process|run|compute|dispatch|render)/]"(
				node
			) {
				checkNode(node, node.id.name);
			},

			// Await expressions calling run(), execute(), or process()
			"AwaitExpression > CallExpression[callee.property.name=/^(run|execute|process)$/]"(
				node
			) {
				checkNode(node, node.callee.property.name);
			},

			// Direct call expressions for orchestrators
			"CallExpression[callee.property.name=/^(createRunner|run)$/]"(
				node
			) {
				const name = node.callee.property && node.callee.property.name;
				checkNode(node, name || "call");
			},
		};
	},
};
