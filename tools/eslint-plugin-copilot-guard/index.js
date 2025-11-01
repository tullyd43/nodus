// eslint-plugin-copilot-guard
// Nodus Compliance Enforcement Plugin
//
// Ensures AI (Copilot) and developers comply with
// Developer Mandates + Security Addendum.

export const meta = {
	name: "eslint-plugin-copilot-guard",
	version: "1.0.0",
	description: "Guards code against violations of Nodus Developer Mandates.",
};

export default {
	rules: {
		//--------------------------------------------------------------------
		// SECURITY
		//--------------------------------------------------------------------
		"no-insecure-api": {
			meta: {
				type: "problem",
				docs: { description: "Block dangerous web/JS APIs." },
			},
			create(ctx) {
				const forbidden = [
					"eval",
					"Function",
					"document.write",
					"innerHTML",
					"outerHTML",
					"insertAdjacentHTML",
					"XMLHttpRequest",
					"fetch",
				];
				return {
					CallExpression(node) {
						const callee = node.callee;
						if (
							callee?.type === "Identifier" &&
							forbidden.includes(callee.name)
						) {
							ctx.report({
								node,
								message: `Use of '${callee.name}' is forbidden by SECURITY_ADDENDUM.md (Section 3.1).`,
							});
						}
					},
					MemberExpression(node) {
						const prop = node.property?.name;
						if (forbidden.includes(prop)) {
							ctx.report({
								node,
								message: `Use of property '${prop}' is forbidden (potential XSS / network leak).`,
							});
						}
					},
				};
			},
		},

		//--------------------------------------------------------------------
		// MANDATE ENFORCEMENT
		//--------------------------------------------------------------------
		"require-jsdoc-and-tests": {
			meta: {
				type: "suggestion",
				docs: {
					description:
						"All public methods require JSDoc and unit test coverage.",
				},
			},
			create(ctx) {
				return {
					MethodDefinition(node) {
						const name = node.key?.name;
						if (!/^_/.test(name)) {
							const src = ctx.getSourceCode();
							let hasJsdoc = false;
							// Prefer ESLint's getJSDocComment when available
							if (typeof src.getJSDocComment === "function") {
								const comment = src.getJSDocComment(node);
								hasJsdoc = !!comment;
							} else {
								const comments = src.getCommentsBefore
									? src.getCommentsBefore(node)
									: [];
								const last = comments[comments.length - 1];
								hasJsdoc = !!(
									last && /\/\*\*/.test(src.getText(last))
								);
							}
							if (!hasJsdoc) {
								ctx.report({
									node,
									message: `Missing JSDoc above public method '${name}'.`,
								});
							}
						}
					},
				};
			},
		},

		//--------------------------------------------------------------------
		// FORENSIC ENFORCEMENT
		//--------------------------------------------------------------------
		"require-forensic-envelope": {
			meta: {
				type: "problem",
				docs: {
					description:
						"All mutating operations must create a forensic envelope.",
				},
			},
			create(ctx) {
				function containsForensicCall(body) {
					const text = ctx.sourceCode.getText(body);
					return /ForensicLogger\.createEnvelope/.test(text);
				}
				return {
					FunctionDeclaration(node) {
						const name = node.id?.name || "";
						if (/^(save|update|delete|create)/i.test(name)) {
							if (!containsForensicCall(node.body)) {
								ctx.report({
									node,
									message: `Function '${name}' mutates data without ForensicLogger envelope.`,
								});
							}
						}
					},
					MethodDefinition(node) {
						const name = node.key?.name || "";
						if (/^(save|update|delete|create)/i.test(name)) {
							if (!containsForensicCall(node.value.body)) {
								ctx.report({
									node,
									message: `Method '${name}' mutates data without ForensicLogger envelope.`,
								});
							}
						}
					},
				};
			},
		},

		//--------------------------------------------------------------------
		// NO DEPENDENCIES
		//--------------------------------------------------------------------
		"no-runtime-dependencies": {
			meta: {
				type: "problem",
				docs: {
					description:
						"Prevent use of external runtime dependencies.",
				},
			},
			create(ctx) {
				return {
					ImportDeclaration(node) {
						const src = node.source.value;
						if (
							!src.startsWith("@") &&
							!src.startsWith("./") &&
							!src.startsWith("../") &&
							!src.startsWith("node:")
						) {
							ctx.report({
								node,
								message: `Runtime dependency '${src}' is not permitted (see DEVELOPER_MANDATES.md §XIII.1).`,
							});
						}
					},
				};
			},
		},
	},
};
