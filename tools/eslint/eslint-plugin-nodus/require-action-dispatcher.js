/**
 * @file Rule to enforce ActionDispatcher usage for synchronous operations and state mutations
 * @copyright 2024 Nodus
 */

const SYNCHRONOUS_OPERATIONS = new Set([
	// State mutations that should go through ActionDispatcher
	'put', 'set', 'update', 'delete', 'remove',
	
	// UI operations that should be declarative actions
	'toggle', 'show', 'hide', 'open', 'close',
	'enable', 'disable', 'activate', 'deactivate',
	
	// Entity operations
	'create', 'modify', 'destroy', 'save'
]);

const ACTIONDISPATCHER_PATTERNS = [
	// Proper ActionDispatcher usage
	/actionDispatcher\.dispatch\(/,
	/\.managers\.actionDispatcher\.dispatch\(/,
	/ActionDispatcher\.dispatch\(/,
	
	// Declarative action patterns (data-action attributes)
	/data-action\s*=\s*["'][^"']+["']/,
];

const DIRECT_STORAGE_PATTERNS = [
	// Direct storage access (should go through ActionDispatcher)
	/stateManager\.storage\.(put|set|update|delete)/,
	/\.managers\.storage\.(put|set|update|delete)/,
	/storage\.instance\.(put|set|update|delete)/,
];

const UI_MUTATION_PATTERNS = [
	// Direct DOM mutations (should be declarative actions)
	/\.style\./,
	/\.classList\./,
	/\.setAttribute\(/,
	/\.removeAttribute\(/,
	/\.textContent\s*=/,
	/\.innerHTML\s*=/,
];

/**
 * Check if operation should go through ActionDispatcher
 */
function isSynchronousOperation(methodName) {
	return SYNCHRONOUS_OPERATIONS.has(methodName);
}

/**
 * Check if code uses ActionDispatcher
 */
function usesActionDispatcher(sourceCode, node) {
	const text = sourceCode.getText(node);
	return ACTIONDISPATCHER_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if code directly accesses storage
 */
function usesDirectStorage(sourceCode, node) {
	const text = sourceCode.getText(node);
	return DIRECT_STORAGE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if code directly mutates UI
 */
function usesDirectUIMutation(sourceCode, node) {
	const text = sourceCode.getText(node);
	return UI_MUTATION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Get containing function for context analysis
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

/**
 * Check if this is in an allowed context (like ActionDispatcher implementation itself)
 */
function isAllowedContext(filename) {
	const allowedContexts = [
		'ActionDispatcher.js',
		'StateUIBridge.js', 
		'BindEngine.js',
		'storage/adapters/',
		'tests/',
		'devtools/'
	];
	
	return allowedContexts.some(context => filename.includes(context));
}

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Enforce ActionDispatcher usage for synchronous operations to ensure automatic observability",
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
					enforceUI: {
						type: "boolean",
						default: true
					},
					enforceStorage: {
						type: "boolean", 
						default: true
					}
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingActionDispatcher: "Synchronous operation '{{operation}}' should use ActionDispatcher. Use: actionDispatcher.dispatch('{{action}}', payload) for automatic observability.",
			directStorageAccess: "Direct storage access '{{method}}' bypasses observability. Use ActionDispatcher: actionDispatcher.dispatch('entity.{{method}}', data)",
			directUIMutation: "Direct UI mutation detected. Use declarative actions: <element data-action='ui.{{action}}' data-context='{{context}}'>",
			missingDeclarativeAction: "UI operation should be declarative. Add data-action attribute or use ActionDispatcher for programmatic actions."
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || []);
		const enforceUI = options.enforceUI !== false;
		const enforceStorage = options.enforceStorage !== false;
		
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = isAllowedContext(filename) || 
			Array.from(allowIn).some(path => filename.includes(path));
		
		if (isAllowed) {
			return {};
		}
		
		const sourceCode = context.getSourceCode();
		
		return {
			// Check method calls for synchronous operations
			CallExpression(node) {
				let methodName = null;
				if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
					methodName = node.callee.property.name;
				}
				
				if (!methodName) return;
				
				// Check for synchronous operations that should use ActionDispatcher
				if (isSynchronousOperation(methodName)) {
					const containingFunction = getContainingFunction(node);
					if (containingFunction && !usesActionDispatcher(sourceCode, containingFunction)) {
						// Suggest appropriate action name
						const actionName = `entity.${methodName}`;
						
						context.report({
							node,
							messageId: "missingActionDispatcher",
							data: { 
								operation: methodName,
								action: actionName
							}
						});
					}
				}
				
				// Check for direct storage access
				if (enforceStorage && usesDirectStorage(sourceCode, node)) {
					context.report({
						node,
						messageId: "directStorageAccess",
						data: { method: methodName }
					});
				}
			},
			
			// Check for direct UI mutations
			MemberExpression(node) {
				if (!enforceUI) return;
				
				if (usesDirectUIMutation(sourceCode, node)) {
					// Try to suggest a declarative action name
					const propertyName = node.property?.name;
					let actionSuggestion = 'update';
					let contextSuggestion = '{}';
					
					if (propertyName === 'style') {
						actionSuggestion = 'setStyle';
						contextSuggestion = '{"property": "...", "value": "..."}';
					} else if (propertyName === 'classList') {
						actionSuggestion = 'toggleClass';
						contextSuggestion = '{"className": "..."}';
					}
					
					context.report({
						node,
						messageId: "directUIMutation",
						data: { 
							action: actionSuggestion,
							context: contextSuggestion
						}
					});
				}
			},
			
			// Check HTML-like content for missing data-action attributes
			Literal(node) {
				if (!enforceUI) return;
				
				if (typeof node.value === 'string') {
					// Look for button/interactive elements without data-action
					const htmlContent = node.value;
					const hasInteractiveElement = /<(button|a|input|select|textarea)[^>]*>/i.test(htmlContent);
					const hasDataAction = /data-action\s*=\s*["'][^"']+["']/i.test(htmlContent);
					
					if (hasInteractiveElement && !hasDataAction) {
						context.report({
							node,
							messageId: "missingDeclarativeAction",
							data: {}
						});
					}
				}
			},
			
			// Check template literals for missing data-action attributes
			TemplateLiteral(node) {
				if (!enforceUI) return;
				
				const templateContent = node.quasis.map(q => q.value.cooked).join('${...}');
				const hasInteractiveElement = /<(button|a|input|select|textarea)[^>]*>/i.test(templateContent);
				const hasDataAction = /data-action\s*=\s*["'][^"']+["']/i.test(templateContent);
				
				if (hasInteractiveElement && !hasDataAction) {
					context.report({
						node,
						messageId: "missingDeclarativeAction",
						data: {}
					});
				}
			}
		};
	},
};
