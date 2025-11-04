/**
 * @file Nodus architectural linting rules for enterprise observability platform
 * @copyright 2024 Nodus
 * @version 2.0 - Enterprise Observability Edition
 */

import enforceCanonicalSanitizer from "./enforce-canonical-sanitizer.js";
import noDirectCoreInstantiation from "./no-direct-core-instantiation.js";
import noDirectDomAccess from "./no-direct-dom-access.js";
import noExternalScripts from "./no-external-scripts.js";
import noManualPlatformCalls from "./no-manual-platform-calls.js";
import noSecurityStringLiterals from "./no-security-string-literals.js";
import preferAliasImports from "./prefer-alias-imports.js";
import requireActionDispatcher from "./require-action-dispatcher.js";
import requireAsyncOrchestration from "./require-async-orchestration.js";
import requireCdsTransport from "./require-cds-transport.js";
import requireLicenseValidation from "./require-license-validation.js";
import requireObservabilityCompliance from "./require-observability-compliance.js";
import requirePerformanceBudget from "./require-performance-budget.js";
import requirePolicyCompliance from "./require-policy-compliance.js";
import requirePolicyGate from "./require-policy-gate.js";
import requireSignedPlugins from "./require-signed-plugins.js";

const plugin = {
	meta: {
		name: "eslint-plugin-nodus",
		version: "2.0.0",
		description:
			"Enterprise observability and security rules for Nodus platform",
	},
	rules: {
		// Core Architecture Rules
		"no-direct-core-instantiation": noDirectCoreInstantiation,
		"require-async-orchestration": requireAsyncOrchestration,
		"require-action-dispatcher": requireActionDispatcher,
		"prefer-alias-imports": preferAliasImports,

		// Security & Access Control Rules
		"no-direct-dom-access": noDirectDomAccess,
		"no-external-scripts": noExternalScripts,
		"no-security-string-literals": noSecurityStringLiterals,
		"enforce-canonical-sanitizer": enforceCanonicalSanitizer,
		"require-cds-transport": requireCdsTransport,

		// Platform Integration Rules
		"no-manual-platform-calls": noManualPlatformCalls,
		"require-observability-compliance": requireObservabilityCompliance,
		"require-policy-gate": requirePolicyGate,
		"require-policy-compliance": requirePolicyCompliance,

		// Enterprise Feature Rules
		"require-license-validation": requireLicenseValidation,
		"require-signed-plugins": requireSignedPlugins,

		// Performance & Quality Rules
		"require-performance-budget": requirePerformanceBudget,
	},
	configs: {
		recommended: {
			plugins: ["nodus"],
			rules: {
				"nodus/no-direct-core-instantiation": "error",
				"nodus/require-async-orchestration": "error",
				"nodus/require-action-dispatcher": "error",
				"nodus/prefer-alias-imports": "error",
				"nodus/no-direct-dom-access": "error",
				"nodus/no-external-scripts": "error",
				"nodus/enforce-canonical-sanitizer": "error",
				"nodus/require-cds-transport": "error",
				"nodus/no-manual-platform-calls": "error",
				"nodus/require-observability-compliance": "error",
				"nodus/require-policy-gate": "warn",
				"nodus/require-policy-compliance": "error",
			},
		},
		enterprise: {
			plugins: ["nodus"],
			rules: {
				// All recommended rules
				"nodus/no-direct-core-instantiation": "error",
				"nodus/require-async-orchestration": "error",
				"nodus/require-action-dispatcher": "error",
				"nodus/prefer-alias-imports": "error",
				"nodus/no-direct-dom-access": "error",
				"nodus/no-external-scripts": "error",
				"nodus/enforce-canonical-sanitizer": "error",
				"nodus/require-cds-transport": "error",
				"nodus/no-manual-platform-calls": "error",
				"nodus/require-observability-compliance": "error",
				"nodus/require-policy-gate": "error",
				"nodus/require-policy-compliance": "error",

				// Enterprise-specific rules
				"nodus/require-license-validation": "error",
				"nodus/require-signed-plugins": "error",
				"nodus/require-performance-budget": "warn",
			},
		},
	},
};

export default plugin;
