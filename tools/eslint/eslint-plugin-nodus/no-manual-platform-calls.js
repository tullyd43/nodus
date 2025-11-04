/**
 * @file Rule to disallow manual, ad-hoc calls to platform services (forensics, metrics, events). Adapted from the original no-manual-forensics rule to cover synchronous entry-points as well as async wrappers, ensuring all instrumentation flows through orchestrated gateways only.
 * @copyright 2024 Nodus
 */

/**
 * Resolve the property name for a member expression segment.
 * @param {import("estree").Expression | import("estree").PrivateIdentifier} property
 * @returns {string | null}
 */
function getPropertyName(property) {
	if (property.type === "Identifier") {
		return property.name;
	}
	if (property.type === "Literal" && typeof property.value === "string") {
		return property.value;
	}
	return null;
}

/**
 * Determine whether the callee object includes any identifier hint (e.g. forensicLogger, metrics).
 * @param {import("estree").Expression} object
 * @param {Set<string>} hints
 * @returns {boolean}
 */
function hasHint(object, hints) {
	if (object.type === "Identifier") {
		return hints.has(object.name);
	}

	if (object.type === "MemberExpression") {
		const propertyName = getPropertyName(object.property);
		return Boolean(propertyName && hints.has(propertyName));
	}

	return false;
}

const FORBIDDEN_PLATFORM_CALLS = [
	{
		domain: "Forensics",
		methods: new Set(["logAuditEvent"]),
		hints: new Set(["forensicLogger", "ForensicLogger", "forensic"]),
	},
	{
		domain: "Metrics",
		methods: new Set(["increment", "decrement", "timer", "gauge"]),
		hints: new Set(["metricsRegistry", "MetricsRegistry", "metrics"]),
	},
	{
		domain: "StateEvents",
		methods: new Set(["emit"]),
		hints: new Set(["stateManager", "HybridStateManager", "eventBus"]),
	},
];

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow manual calls to platform services (forensics, metrics, events) in favor of orchestrated gateways.",
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
				"Manual {{domain}} call '{{name}}' is prohibited. Use AsyncOrchestrationService, ActionDispatcher, or 'this.#run' to attach orchestration metadata.",
		},
	},
	create(context) {
		const DEFAULT_ALLOW = [
			"src/platform/bootstrap/",
			"src/shared/lib/async/",
			"src/platform/actions/",
			"tests/",
		];

		const optionAllow =
			Array.isArray(context.options?.[0]?.allowIn) &&
			context.options[0].allowIn.length > 0
				? context.options[0].allowIn
				: [];

		const allowList = new Set([...DEFAULT_ALLOW, ...optionAllow]);

		function isAllowed(filename) {
			const normalized = filename.replace(/\\/g, "/");
			for (const allowedPath of allowList) {
				if (normalized.includes(allowedPath)) {
					return true;
				}
			}
			return false;
		}

		function resolveForbiddenTarget(memberExpression) {
			const propertyName = getPropertyName(memberExpression.property);
			if (!propertyName) {
				return null;
			}

			for (const target of FORBIDDEN_PLATFORM_CALLS) {
				if (!target.methods.has(propertyName)) {
					continue;
				}
				if (!hasHint(memberExpression.object, target.hints)) {
					continue;
				}
				return target;
			}

			return null;
		}

		return {
			CallExpression(node) {
				if (isAllowed(context.getFilename())) {
					return;
				}

				let callee = node.callee;
				if (callee.type === "ChainExpression") {
					callee = callee.expression;
				}

				if (callee.type !== "MemberExpression") {
					return;
				}

				const target = resolveForbiddenTarget(callee);
				if (!target) {
					return;
				}

				context.report({
					node: callee.property,
					messageId: "manualCall",
					data: {
						domain: target.domain,
						name: getPropertyName(callee.property),
					},
				});
			},
		};
	},
};
