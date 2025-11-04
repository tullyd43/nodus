/**
 * @file Rule to ensure operations use automatic observability through orchestrator and policy compliance
 * @copyright 2024 Nodus
 */

const OBSERVABLE_OPERATIONS = new Map([
	// Storage operations - automatically observable through storage adapters
	['put', { autoInstrumented: true, requiresOrchestrator: false }],
	['set', { autoInstrumented: true, requiresOrchestrator: false }],
	['get', { autoInstrumented: true, requiresOrchestrator: false }],
	['query', { autoInstrumented: true, requiresOrchestrator: false }],
	['delete', { autoInstrumented: true, requiresOrchestrator: false }],
	
	// Async operations - must go through orchestrator for observability
	['fetch', { autoInstrumented: false, requiresOrchestrator: true }],
	['process', { autoInstrumented: false, requiresOrchestrator: true }],
	['execute', { autoInstrumented: false, requiresOrchestrator: true }],
	['run', { autoInstrumented: false, requiresOrchestrator: true }],
	
	// Policy operations - automatically observable through policy engine
	['updatePolicy', { autoInstrumented: true, requiresOrchestrator: false }],
	['setPolicy', { autoInstrumented: true, requiresOrchestrator: false }],
	
	// System operations - automatically observable through system control
	['optimizePerformance', { autoInstrumented: true, requiresOrchestrator: false }],
	['emergencySystemControl', { autoInstrumented: true, requiresOrchestrator: false }],
]);

const MANUAL_LOGGING_PATTERNS = [
	// Manual forensic logging (should be automatic)
	/forensicLogger\.createEnvelope\(/,
	/forensicLogger\.logAuditEvent\(/,
	/\.logForensicEvent\(/,
	/ForensicLogger\.createEnvelope\(/,
	
	// Manual metrics (should be automatic through orchestrator)
	/metricsRegistry\.increment\(/,
	/metricsRegistry\.timer\(/,
	/\.metrics\.increment\(/,
	/\.metrics\.timer\(/,
];

const ORCHESTRATOR_PATTERNS = [
	// Proper orchestrator usage
	/orchestrator\.run\(/,
	/\.createRunner\(/,
	/AsyncOrchestrator\.run\(/,
	/asyncOrchestrator\.wrap\(/,
];

const AUTOMATIC_INSTRUMENTATION_PATTERNS = [
	// Storage operations through state manager (automatically instrumented)
	/stateManager\.storage\./,
	/\.managers\.storage\./,
	
	// Policy operations through policy engine (automatically instrumented)
	/\.managers\.policies\./,
	/policyEngine\./,
	
	// System operations through system control (automatically instrumented)
	/systemControl\./,
	/\.enterprise\./,
];

/**
 * Check if operation should be automatically instrumented
 */
function isAutoInstrumented(methodName) {
	const operation = OBSERVABLE_OPERATIONS.get(methodName);
	return operation?.autoInstrumented || false;
}

/**
 * Check if operation requires orchestrator for observability
 */
function requiresOrchestrator(methodName) {
	const operation = OBSERVABLE_OPERATIONS.get(methodName);
	return operation?.requiresOrchestrator || false;
}

/**
 * Check if code uses manual logging (anti-pattern)
 */
function hasManualLogging(sourceCode, node) {
	const text = sourceCode.getText(node);
	return MANUAL_LOGGING_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if code uses proper orchestrator pattern
 */
function usesOrchestrator(sourceCode, node) {
	const text = sourceCode.getText(node);
	return ORCHESTRATOR_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if operation goes through automatically instrumented path
 */
function usesAutoInstrumentation(sourceCode, node) {
	const text = sourceCode.getText(node);
	return AUTOMATIC_INSTRUMENTATION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Find containing function for context analysis
 */
function getContainingFunction(node) {
	let current = node.parent;
	while (current) {
		if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'MethodDefinition'].includes(current.type)) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Ensure operations use automatic observability through orchestrator and policy compliance, not manual logging",
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
					enforceAutomatic: {
						type: "boolean",
						default: true
					}
				},
				additionalProperties: false,
			},
		],
		messages: {
			manualLoggingDetected: "Manual observability detected. Observability should be automatic through orchestrator/policy engine, not manual {{method}} calls.",
			missingOrchestrator: "Operation '{{operation}}' requires orchestrator for automatic observability. Use: orchestrator.run(() => {{operation}}())",
			useAutoInstrumentation: "Operation '{{operation}}' should use automatically instrumented path (e.g., stateManager.storage.{{operation}}) for observability.",
			encourageAutomatic: "Consider using automatic observability through orchestrator or state manager instead of manual instrumentation."
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || [
			"tests/",
			"src/platform/bootstrap/",
			"src/platform/observability/", // Allow manual logging in observability implementation itself
			"src/devtools/"
		]);
		const enforceAutomatic = options.enforceAutomatic !== false;
		
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some(path => filename.includes(path));
		
		if (isAllowed) {
			return {};
		}
		
		const sourceCode = context.getSourceCode();
		
		return {
			// Detect manual logging calls (anti-pattern)
			CallExpression(node) {
				if (!enforceAutomatic) return;
				
				// Check for manual forensic/metrics logging
				const callText = sourceCode.getText(node);
				for (const pattern of MANUAL_LOGGING_PATTERNS) {
					if (pattern.test(callText)) {
						// Extract method name for better error message
						const match = callText.match(/\.(\w+)\(/);
						const methodName = match ? match[1] : 'logging method';
						
						context.report({
							node,
							messageId: "manualLoggingDetected",
							data: { method: methodName }
						});
						return;
					}
				}
				
				// Check observable operations
				let methodName = null;
				if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
					methodName = node.callee.property.name;
				} else if (node.callee.type === 'Identifier') {
					methodName = node.callee.name;
				}
				
				if (!methodName || !OBSERVABLE_OPERATIONS.has(methodName)) return;
				
				// For operations that require orchestrator
				if (requiresOrchestrator(methodName)) {
					const containingFunction = getContainingFunction(node);
					if (containingFunction && !usesOrchestrator(sourceCode, containingFunction)) {
						context.report({
							node,
							messageId: "missingOrchestrator",
							data: { operation: methodName }
						});
					}
				}
				
				// For operations that should use auto-instrumented paths
				if (isAutoInstrumented(methodName)) {
					if (!usesAutoInstrumentation(sourceCode, node)) {
						context.report({
							node,
							messageId: "useAutoInstrumentation",
							data: { operation: methodName }
						});
					}
				}
			},
			
			// Detect any manual instrumentation in functions
			'FunctionDeclaration, MethodDefinition'(node) {
				if (!enforceAutomatic) return;
				
				if (hasManualLogging(sourceCode, node)) {
					const functionName = node.key?.name || node.id?.name || 'anonymous';
					
					// Only suggest if this isn't clearly an observability implementation function
					if (!functionName.includes('log') && !functionName.includes('audit') && !functionName.includes('forensic')) {
						context.report({
							node: node.key || node.id || node,
							messageId: "encourageAutomatic",
							data: {}
						});
					}
				}
			}
		};
	},
};
