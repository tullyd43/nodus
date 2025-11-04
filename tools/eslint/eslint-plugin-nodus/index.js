/**
 * @file Complete Nodus ESLint Plugin Configuration Package
 * @version 2.2.0 - Production Architecture Support with Individual Rule Allowlist Loading
 * @description Comprehensive ESLint rules package for entire Nodus codebase with proper allowlist support
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

export default {
	rules: {
		// Core Architecture Rules - Updated with allowlist support in individual rules
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

		// Platform Integration Rules - Updated with allowlist support in individual rules
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
				// Architecture rules (ERROR - must fix)
				"nodus/no-direct-core-instantiation": "error",
				"nodus/require-async-orchestration": "error",
				"nodus/require-action-dispatcher": "error",
				"nodus/prefer-alias-imports": "error",

				// Security rules (ERROR - must fix)
				"nodus/no-direct-dom-access": "error",
				"nodus/no-external-scripts": "error",
				"nodus/require-cds-transport": "error",
				"nodus/no-security-string-literals": "error",

				// Observability rules (ERROR - must fix)
				"nodus/require-observability-compliance": "error",
				"nodus/require-policy-compliance": "error",

				// Performance rules (WARN - should fix)
				"nodus/require-performance-budget": "warn",
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
				"nodus/require-cds-transport": "error",
				"nodus/no-security-string-literals": "error",
				"nodus/require-observability-compliance": "error",
				"nodus/require-policy-compliance": "error",
				"nodus/require-performance-budget": "warn",

				// Additional enterprise rules
				"nodus/require-license-validation": "error",
				"nodus/require-signed-plugins": "error",
				"nodus/require-policy-gate": "error",
				"nodus/enforce-canonical-sanitizer": "error",
				"nodus/no-manual-platform-calls": "error",
			},
		},
	},
};
