/**
 * @file Rule to disallow manual, ad-hoc calls to forensic, metrics, and embedding systems.
 * @copyright 2024 Nodus
 */

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow manual calls to forensic, metrics, and embedding managers in favor of automated orchestration.",
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
			manualCall:
				"Manual {{domain}} call '{{name}}' is prohibited. Use AsyncOrchestrator plugins instead.",
		},
	},
	create(context) {
		const DEFAULT_ALLOW = [
			"src/platform/security/",
			"src/platform/bootstrap/SystemBootstrap.js",
			"src/shared/lib/async/",
			"tests/",
		];
		const optionAllow =
			Array.isArray(context.options?.[0]?.allowIn) &&
			context.options[0].allowIn.length > 0
				? context.options[0].allowIn
				: [];
		const allowList = [...DEFAULT_ALLOW, ...optionAllow];

		/**
		 * Determines whether the current file is exempted.
		 * @param {string} filename
		 * @returns {boolean}
		 */
		function isAllowed(filename) {
			return allowList.some((pattern) => filename.includes(pattern));
		}

		/**
		 * @param {import("estree").Node} node
		 * @returns {string|null}
		 */
		function getPropertyName(node) {
			if (!node) return null;
			if (node.type === "Identifier") return node.name;
			if (node.type === "Literal") return String(node.value);
			if (node.type === "PrivateIdentifier") return `#${node.name}`;
			return null;
		}

		/**
		 * Walks an expression chain to determine whether any segment matches the provided hints.
		 * @param {import("estree").Expression|import("estree").PrivateIdentifier} expression
		 * @param {Set<string>} hints
		 * @returns {boolean}
		 */
		function hasHint(expression, hints) {
			let current = expression;
			while (current) {
				if (current.type === "Identifier") {
					if (hints.has(current.name)) return true;
					return false;
				}
				if (current.type === "PrivateIdentifier") {
					return hints.has(`#${current.name}`);
				}
				if (current.type === "MemberExpression") {
					const propertyName = getPropertyName(current.property);
					if (propertyName && hints.has(propertyName)) return true;
					current = current.object;
					continue;
				}
				if (current.type === "ThisExpression") {
					return false;
				}
				if (current.type === "ChainExpression") {
					current = current.expression;
					continue;
				}
				if (current.type === "CallExpression") {
					current = current.callee;
					continue;
				}
				return false;
			}
			return false;
		}

		const TARGETS = [
			{
				domain: "forensic",
				methods: new Set([
					"createEnvelope",
					"commitEnvelope",
					"logAuditEvent",
					"logEnvelope",
				]),
				hints: new Set([
					"forensicLogger",
					"ForensicLogger",
				]),
			},
			{
				domain: "metrics",
				methods: new Set(["increment", "updateAverage", "record"]),
				hints: new Set([
					"metricsRegistry",
					"metrics",
					"metricsNamespace",
					"MetricsRegistry",
					"metricsReporter",
					"metricsManager",
				]),
			},
			{
				domain: "embedding",
				methods: new Set([
					"createEmbedding",
					"queueEmbedding",
					"updateEmbedding",
					"deleteEmbedding",
				]),
				hints: new Set([
					"embeddingManager",
					"EmbeddingManager",
					"embeddings",
				]),
			},
		];

		/**
		 * Returns the set entry that matches the given call expression.
		 * @param {import("estree").MemberExpression} memberExpression
		 * @returns {{domain:string, methods:Set<string>, hints:Set<string>}|null}
		 */
		function resolveTarget(memberExpression) {
			const propertyName = getPropertyName(memberExpression.property);
			if (!propertyName) return null;

			for (const target of TARGETS) {
				if (!target.methods.has(propertyName)) continue;
				if (!hasHint(memberExpression.object, target.hints)) continue;
				return target;
			}
			return null;
		}

		/**
		 * Handles detection for call expressions.
		 * @param {import("estree").CallExpression} node
		 * @returns {void}
		 */
		function handleCallExpression(node) {
			const filename = context.getFilename();
			if (isAllowed(filename)) return;

			let callee = node.callee;
			if (callee.type === "ChainExpression") {
				callee = callee.expression;
			}

			if (callee.type !== "MemberExpression") return;

			const target = resolveTarget(callee);
			if (!target) return;

			context.report({
				node: callee.property,
				messageId: "manualCall",
				data: {
					name: getPropertyName(callee.property),
					domain: target.domain,
				},
			});
		}

		return {
			CallExpression: handleCallExpression,
		};
	},
};
