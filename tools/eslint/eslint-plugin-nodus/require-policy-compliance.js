/**
 * @file Rule to ensure operations respect unified policy engine controls
 * @copyright 2024 Nodus
 */

const POLICY_SENSITIVE_OPERATIONS = [
	// System operations that must check policies
	{ method: 'set', object: 'cache', policyDomain: 'cache' },
	{ method: 'get', object: 'cache', policyDomain: 'cache' },
	{ method: 'increment', object: 'metrics', policyDomain: 'metrics' },
	{ method: 'timer', object: 'metrics', policyDomain: 'metrics' },
	{ method: 'put', object: 'storage', policyDomain: 'storage' },
	{ method: 'query', object: 'storage', policyDomain: 'storage' },
	{ method: 'findSimilar', object: 'embedding', policyDomain: 'embeddings' },
	{ method: 'generate', object: 'embedding', policyDomain: 'embeddings' },
	{ method: 'run', object: 'orchestrator', policyDomain: 'async' },
	{ method: 'createRunner', object: 'orchestrator', policyDomain: 'async' }
];

const POLICY_CHECK_PATTERNS = [
	/policies\.getPolicy\(/,
	/\.managers\.policies\.getPolicy\(/,
	/PolicyEngine\.getPolicy\(/,
	/this\.checkPolicy\(/,
	/await this\.validatePolicy\(/
];

/**
 * Check if a function contains policy validation logic
 */
function hasPolicyCheck(sourceCode, functionNode) {
	const functionText = sourceCode.getText(functionNode);
	return POLICY_CHECK_PATTERNS.some(pattern => pattern.test(functionText));
}

/**
 * Determine if a call expression is a policy-sensitive operation
 */
function isPolicySensitiveOperation(node) {
	if (node.type !== 'CallExpression') return null;
	
	let callee = node.callee;
	if (callee.type === 'ChainExpression') {
		callee = callee.expression;
	}
	
	if (callee.type !== 'MemberExpression') return null;
	
	const methodName = callee.property?.name;
	if (!methodName) return null;
	
	// Check if this matches any policy-sensitive operation
	for (const operation of POLICY_SENSITIVE_OPERATIONS) {
		if (operation.method === methodName) {
			// Try to determine the object type from the call chain
			const callText = callee.object?.name || '';
			if (callText.toLowerCase().includes(operation.object) || 
				operation.object === 'cache' && callText.includes('Cache') ||
				operation.object === 'metrics' && callText.includes('metrics') ||
				operation.object === 'storage' && callText.includes('storage') ||
				operation.object === 'embedding' && callText.includes('embedding') ||
				operation.object === 'orchestrator' && callText.includes('orchestrator')) {
				return operation;
			}
		}
	}
	
	return null;
}

/**
 * Find the containing function for a node
 */
function getContainingFunction(node) {
	let parent = node.parent;
	while (parent) {
		if (parent.type === 'FunctionDeclaration' || 
			parent.type === 'FunctionExpression' || 
			parent.type === 'ArrowFunctionExpression' ||
			parent.type === 'MethodDefinition') {
			return parent;
		}
		parent = parent.parent;
	}
	return null;
}

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Ensure operations respect unified policy engine controls for enterprise observability",
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
					enforceLevel: {
						type: "string",
						enum: ["basic", "enterprise"],
						default: "basic"
					}
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingPolicyCheck: "Policy-sensitive operation '{{operation}}' must check policy '{{domain}}' before execution. Add: policies.getPolicy('{{domain}}', 'enabled') or similar validation.",
			enterpriseFeatureGate: "Enterprise feature '{{operation}}' requires license validation and policy compliance checks."
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || [
			"tests/",
			"src/platform/bootstrap/",
			"src/platform/policies/"
		]);
		const enforceLevel = options.enforceLevel || 'basic';
		
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some(path => filename.includes(path));
		
		if (isAllowed) {
			return {};
		}
		
		return {
			CallExpression(node) {
				const operation = isPolicySensitiveOperation(node);
				if (!operation) return;
				
				// Find the containing function
				const containingFunction = getContainingFunction(node);
				if (!containingFunction) return;
				
				// Check if the function has policy validation
				const sourceCode = context.getSourceCode();
				const hasPolicyValidation = hasPolicyCheck(sourceCode, containingFunction);
				
				if (!hasPolicyValidation) {
					// For enterprise level, also check for license validation
					if (enforceLevel === 'enterprise') {
						const functionText = sourceCode.getText(containingFunction);
						const hasLicenseCheck = /license\.hasFeature\(|\.validateLicense\(/i.test(functionText);
						
						if (!hasLicenseCheck) {
							context.report({
								node,
								messageId: "enterpriseFeatureGate",
								data: {
									operation: operation.method
								}
							});
							return;
						}
					}
					
					context.report({
						node,
						messageId: "missingPolicyCheck",
						data: {
							operation: operation.method,
							domain: operation.policyDomain
						}
					});
				}
			}
		};
	},
};
