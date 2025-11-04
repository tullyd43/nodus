/**
 * @file Rule to enforce signed plugin architecture for enterprise plugin system
 * @copyright 2024 Nodus
 */

const PLUGIN_OPERATIONS = new Map([
	// Plugin registration (must validate signatures)
	['registerPlugin', { requiresSignature: 'conditional', enterpriseOnly: false }],
	['loadPlugin', { requiresSignature: 'conditional', enterpriseOnly: false }],
	['installPlugin', { requiresSignature: 'conditional', enterpriseOnly: false }],
	
	// Enterprise plugin operations (always require signatures)
	['registerEnterprisePlugin', { requiresSignature: true, enterpriseOnly: true }],
	['loadSignedPlugin', { requiresSignature: true, enterpriseOnly: true }],
	['validatePluginSignature', { requiresSignature: false, enterpriseOnly: true }],
	
	// Plugin management operations
	['enablePlugin', { requiresSignature: 'conditional', enterpriseOnly: false }],
	['disablePlugin', { requiresSignature: false, enterpriseOnly: false }],
	['unloadPlugin', { requiresSignature: false, enterpriseOnly: false }],
	['updatePlugin', { requiresSignature: 'conditional', enterpriseOnly: false }]
]);

const SIGNATURE_VALIDATION_PATTERNS = [
	// Signature verification methods
	/validateSignature\(/,
	/verifyPluginSignature\(/,
	/checkSignature\(/,
	/\.signature\.verify\(/,
	/crypto\.verify\(/,
	
	// Plugin manifest validation
	/validateManifest\(/,
	/verifyManifest\(/,
	/checkManifestSignature\(/,
	
	// Cryptographic validation
	/subtle\.verify\(/,
	/ECDSA.*verify/,
	/Ed25519.*verify/
];

const ENTERPRISE_PLUGIN_INDICATORS = [
	// Plugin manifest enterprise flags
	/enterprisePlugin\s*:\s*true/,
	/requiresEnterpriseLicense\s*:\s*true/,
	/signedPlugin\s*:\s*true/,
	
	// Enterprise capabilities
	/systemAccess\s*:\s*true/,
	/policyControl\s*:\s*true/,
	/performanceOptimization\s*:\s*true/,
	/complianceFeatures\s*:\s*true/
];

const UNSIGNED_PLUGIN_PATTERNS = [
	// Community plugin patterns
	/communityPlugin\s*:\s*true/,
	/unsigned\s*:\s*true/,
	/\.unsigned\s*=\s*true/,
	
	// Development/test plugins
	/development\s*:\s*true/,
	/testPlugin\s*:\s*true/
];

/**
 * Check if plugin operation requires signature validation
 */
function requiresSignatureValidation(methodName, context = {}) {
	const operation = PLUGIN_OPERATIONS.get(methodName);
	if (!operation) return false;
	
	if (operation.requiresSignature === true) return true;
	if (operation.requiresSignature === 'conditional') {
		return context.isEnterprisePlugin || context.hasSystemAccess;
	}
	
	return false;
}

/**
 * Check if code contains signature validation
 */
function hasSignatureValidation(sourceCode, node) {
	const text = sourceCode.getText(node);
	return SIGNATURE_VALIDATION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if plugin is marked as enterprise
 */
function isEnterprisePlugin(sourceCode, node) {
	const text = sourceCode.getText(node);
	return ENTERPRISE_PLUGIN_INDICATORS.some(pattern => pattern.test(text));
}

/**
 * Check if plugin is explicitly unsigned
 */
function isUnsignedPlugin(sourceCode, node) {
	const text = sourceCode.getText(node);
	return UNSIGNED_PLUGIN_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Find plugin manifest or configuration in call arguments
 */
function getPluginConfig(node) {
	if (node.arguments.length === 0) return null;
	
	// Look for object expression in arguments
	for (const arg of node.arguments) {
		if (arg.type === 'ObjectExpression') {
			return arg;
		}
		if (arg.type === 'Identifier') {
			// Could be a variable containing plugin config
			return arg;
		}
	}
	
	return null;
}

/**
 * Check if license validation is present
 */
function hasLicenseValidation(sourceCode, node) {
	const text = sourceCode.getText(node);
	return /license\.hasFeature\(|validateEnterpriseAccess\(/i.test(text);
}

/**
 * Get containing function for validation checks
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
			description: "Enforce signed plugin architecture and validation for enterprise plugin system",
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
						enum: ["basic", "enterprise", "strict"],
						default: "basic"
					},
					allowUnsignedInDev: {
						type: "boolean",
						default: true
					}
				},
				additionalProperties: false,
			},
		],
		messages: {
			missingSignatureValidation: "Plugin operation '{{operation}}' requires signature validation. Add: await validatePluginSignature(plugin) before registration.",
			enterprisePluginRequiresSignature: "Enterprise plugin registration requires cryptographic signature validation and license check.",
			unsignedEnterprisePlugin: "Plugin with enterprise capabilities must be signed. Remove enterprise features or add proper signature.",
			missingLicenseValidation: "Enterprise plugin operation requires license validation before signature verification.",
			communityPluginWithSystemAccess: "Community plugin cannot have system access capabilities. Use enterprise signed plugin or remove system access."
		},
	},
	create(context) {
		const options = context.options[0] || {};
		const allowIn = new Set(options.allowIn || [
			"tests/",
			"src/devtools/",
			"scripts/",
			"src/platform/plugins/test/"
		]);
		const enforceLevel = options.enforceLevel || 'basic';
		const allowUnsignedInDev = options.allowUnsignedInDev !== false;
		
		const filename = context.getFilename().replace(/\\/g, "/");
		const isAllowed = Array.from(allowIn).some(path => filename.includes(path));
		
		// Allow unsigned plugins in development if configured
		const isDevelopment = filename.includes('dev') || filename.includes('test') || 
			process.env.NODE_ENV === 'development';
		
		if (isAllowed || (allowUnsignedInDev && isDevelopment)) {
			return {};
		}
		
		const sourceCode = context.getSourceCode();
		
		return {
			CallExpression(node) {
				// Check plugin operation calls
				let methodName = null;
				if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
					methodName = node.callee.property.name;
				} else if (node.callee.type === 'Identifier') {
					methodName = node.callee.name;
				}
				
				if (!methodName || !PLUGIN_OPERATIONS.has(methodName)) return;
				
				const operation = PLUGIN_OPERATIONS.get(methodName);
				const pluginConfig = getPluginConfig(node);
				
				// Determine plugin characteristics
				const isEnterprise = pluginConfig ? isEnterprisePlugin(sourceCode, pluginConfig) : false;
				const isUnsigned = pluginConfig ? isUnsignedPlugin(sourceCode, pluginConfig) : false;
				
				const context_info = {
					isEnterprisePlugin: isEnterprise,
					hasSystemAccess: isEnterprise // Simplified assumption
				};
				
				// Check if signature validation is required
				const requiresSignature = requiresSignatureValidation(methodName, context_info);
				
				if (requiresSignature) {
					const containingFunction = getContainingFunction(node);
					if (!containingFunction) return;
					
					// Check for signature validation
					const hasSignature = hasSignatureValidation(sourceCode, containingFunction);
					
					if (!hasSignature) {
						// For enterprise operations, also check license validation
						if (operation.enterpriseOnly || isEnterprise) {
							if (enforceLevel === 'enterprise' || enforceLevel === 'strict') {
								const hasLicense = hasLicenseValidation(sourceCode, containingFunction);
								if (!hasLicense) {
									context.report({
										node,
										messageId: "missingLicenseValidation",
										data: { operation: methodName }
									});
									return;
								}
							}
							
							context.report({
								node,
								messageId: "enterprisePluginRequiresSignature",
								data: { operation: methodName }
							});
						} else {
							context.report({
								node,
								messageId: "missingSignatureValidation",
								data: { operation: methodName }
							});
						}
					}
				}
				
				// Check for enterprise features without proper signing
				if (isEnterprise && isUnsigned) {
					context.report({
						node: pluginConfig || node,
						messageId: "unsignedEnterprisePlugin",
						data: {}
					});
				}
				
				// Check for community plugins with system access
				if (!isEnterprise && isUnsigned && pluginConfig) {
					const configText = sourceCode.getText(pluginConfig);
					if (/systemAccess\s*:\s*true|policyControl\s*:\s*true/.test(configText)) {
						context.report({
							node: pluginConfig,
							messageId: "communityPluginWithSystemAccess",
							data: {}
						});
					}
				}
			},
			
			// Check plugin manifest objects
			ObjectExpression(node) {
				// Look for plugin manifests (objects with plugin-like properties)
				const properties = node.properties;
				const hasPluginProps = properties.some(prop => {
					if (prop.type === 'Property' && prop.key.type === 'Identifier') {
						return ['name', 'version', 'capabilities', 'permissions'].includes(prop.key.name);
					}
					return false;
				});
				
				if (!hasPluginProps) return;
				
				// Check if this manifest has enterprise features but isn't signed
				const isEnterprise = isEnterprisePlugin(sourceCode, node);
				const isUnsigned = isUnsignedPlugin(sourceCode, node);
				
				if (isEnterprise && isUnsigned && enforceLevel !== 'basic') {
					context.report({
						node,
						messageId: "unsignedEnterprisePlugin",
						data: {}
					});
				}
			}
		};
	},
};
