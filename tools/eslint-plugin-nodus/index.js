// tools/eslint-plugin-nodus/index.js
// Minimal custom rules for the Nodus project (no external deps)
export const meta = { name: "eslint-plugin-nodus", version: "0.1.0" };

function isCoreClass(name) {
	return [
		"HybridStateManager",
		"StorageLoader",
		"MACEngine",
		"ClassificationCrypto",
		"ForensicLogger",
	].includes(name);
}

export default {
	rules: {
		"no-direct-core-instantiation": {
			meta: {
				type: "problem",
				docs: { description: "Disallow new Core() outside factories" },
			},
			create(ctx) {
				return {
					NewExpression(node) {
						const callee = node.callee;
						if (
							callee &&
							callee.type === "Identifier" &&
							isCoreClass(callee.name)
						) {
							const filename = ctx.filename || "";
							const allowed =
								/Factory|Bootstrap|SystemBootstrap|ServiceRegistry/.test(
									filename
								);
							if (!allowed) {
								ctx.report({
									node,
									message: `Do not instantiate core class '${callee.name}' directly; use ServiceRegistry/Factory.`,
								});
							}
						}
					},
				};
			},
		},

		"no-dangerous-eval": {
			meta: {
				type: "problem",
				docs: { description: "Block eval/new Function/unsafe timers" },
			},
			create(ctx) {
				const forbidCallee = new Set([
					"eval",
					"Function",
					"setTimeout",
					"setInterval",
				]);
				return {
					CallExpression(node) {
						const id = node.callee;
						if (
							id?.type === "Identifier" &&
							forbidCallee.has(id.name)
						) {
							if (
								id.name === "setTimeout" ||
								id.name === "setInterval"
							) {
								const first = node.arguments[0];
								if (
									first &&
									first.type === "Literal" &&
									typeof first.value === "string"
								) {
									ctx.report({
										node,
										message:
											"String-based timers are forbidden.",
									});
								}
								return;
							}
							if (id.name === "eval") {
								ctx.report({
									node,
									message: "eval is forbidden.",
								});
							}
						}
					},
					NewExpression(node) {
						if (
							node.callee?.type === "Identifier" &&
							node.callee.name === "Function"
						) {
							ctx.report({
								node,
								message: "new Function is forbidden.",
							});
						}
					},
				};
			},
		},

		"forensic-required": {
			meta: {
				type: "suggestion",
				docs: {
					description: "Mutation paths must create forensic envelope",
				},
			},
			create(ctx) {
				function hasForensicCall(body) {
					const src = ctx.getSourceCode().getText(body);
					return /ForensicLogger|createEnvelope/.test(src);
				}

				return {
					FunctionDeclaration(node) {
						const n = node.id?.name || "";
						if (/^(save|create|update|delete)/i.test(n)) {
							if (!hasForensicCall(node.body)) {
								ctx.report({
									node,
									message: `Function '${n}' mutates state without forensic envelope.`,
								});
							}
						}
					},
					MethodDefinition(node) {
						const n = node.key?.name || "";
						if (/^(save|create|update|delete)/i.test(n)) {
							if (
								node.value?.body &&
								!hasForensicCall(node.value.body)
							) {
								ctx.report({
									node,
									message: `Method '${n}' mutates state without forensic envelope.`,
								});
							}
						}
					},
				};
			},
		},
	},
};
