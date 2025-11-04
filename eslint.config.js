/**
 * @file Complete ESLint Configuration for Nodus Project
 * @version 2.1.0 - Production Architecture Support
 * @description Project-wide ESLint configuration with updated rules for entire codebase
 */

import nodusPlugin from "./tools/eslint/eslint-plugin-nodus/index.js";
import nodusExceptions from "./tools/eslint/.eslint.config.exception.js";

export default [
	// Base configuration for all JavaScript/TypeScript files
	{
		files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
		plugins: {
			nodus: nodusPlugin,
		},
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		rules: {
			// Core ESLint rules
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"no-console": [
				"warn",
				{
					allow: ["warn", "error"],
				},
			],
			"prefer-const": "error",
			"no-var": "error",

			// Nodus core architecture rules (UPDATED)
			"nodus/no-direct-core-instantiation": "error",
			// "nodus/require-async-orchestration": [
			// 	"error",
			// 	{
			// 		recognizeWrappers: true,
			// 		allowIn: [
			// 			"src/platform/services/", // Service layer can use wrappers
			// 			"src/platform/managers/", // Manager layer can use wrappers
			// 			"src/shared/lib/", // Shared libraries
			// 			"src/platform/bootstrap/", // Bootstrap code
			// 			"src/platform/observability/", // Observability infrastructure
			// 			"tests/", // Test files
			// 			"src/devtools/", // Development tools
			// 			"scripts/", // Build scripts
			// 			"src/examples/", // Example code
			// 		],
			// 	},
			// ],
			// "nodus/require-action-dispatcher": [
			// 	"error",
			// 	{
			// 		enforceStorage: true,
			// 		enforceCache: true,
			// 		enforceUI: true,
			// 		allowIn: [
			// 			"src/platform/actions/", // ActionDispatcher implementation
			// 			"src/platform/bootstrap/", // Bootstrap code
			// 			"src/platform/storage/adapters/", // Storage adapters
			// 			"tests/", // Test files
			// 		],
			// 	},
			// ],
			// "nodus/prefer-alias-imports": "error",

			// // Security rules (STRICT)
			// "nodus/no-direct-dom-access": "error",
			// "nodus/no-external-scripts": "error",
			// "nodus/no-security-string-literals": "error",
			// "nodus/require-cds-transport": "error",

			// // Platform integration rules (UPDATED)
			// "nodus/no-manual-platform-calls": [
			// 	"error",
			// 	{
			// 		allowIn: [
			// 			"src/platform/bootstrap/",
			// 			"src/platform/observability/",
			// 			"src/shared/lib/async/",
			// 			"src/platform/policies/",
			// 			"tests/",
			// 			"scripts/",
			// 		],
			// 	},
			// ],
			// "nodus/require-observability-compliance": [
			// 	"error",
			// 	{
			// 		enforceForensic: true,
			// 		enforceActionDispatcher: true,
			// 		enforceOrchestrator: true,
			// 		allowIn: [
			// 			"src/platform/observability/", // Observability implementation
			// 			"src/platform/bootstrap/", // Bootstrap code
			// 			"tests/", // Test files
			// 		],
			// 	},
			// ],
			// "nodus/require-policy-compliance": "error",
			// "nodus/require-policy-gate": "error",

			// // Performance rules
			// "nodus/require-performance-budget": "warn",
		},
	},

	// Enterprise-specific configuration
	{
		files: [
			"src/platform/enterprise/**/*.{js,mjs,cjs}",
			"src/enterprise/**/*.{js,mjs,cjs}",
			"src/platform/services/**/*.{js,mjs,cjs}",
			"src/platform/managers/**/*.{js,mjs,cjs}",
		],
		rules: {
			// Enterprise features require license validation
			"nodus/require-license-validation": [
				"error",
				{
					allowIn: [
						"src/platform/bootstrap/",
						"src/platform/license/",
						"tests/",
					],
				},
			],
			"nodus/require-signed-plugins": [
				"error",
				{
					allowIn: [
						"src/platform/bootstrap/",
						"src/platform/plugins/",
						"tests/",
					],
				},
			],
			// Stricter performance requirements for enterprise
			"nodus/require-performance-budget": "error",
		},
	},

	// UI-specific configuration
	{
		files: [
			"src/ui/**/*.{js,jsx,mjs}",
			"src/features/ui/**/*.{js,jsx,mjs}",
			"src/platform/ui/**/*.{js,jsx,mjs}",
		],
		rules: {
			// UI can access DOM through SafeDOM
			"nodus/no-direct-dom-access": "error",
			// UI must use declarative actions
			"nodus/require-action-dispatcher": [
				"error",
				{
					enforceUI: true,
					enforceStorage: true,
					enforceCache: false, // UI doesn't directly use cache
				},
			],
		},
	},

	// Service layer configuration
	{
		files: [
			"src/platform/services/**/*.{js,mjs,cjs}",
			"src/shared/services/**/*.{js,mjs,cjs}",
		],
		rules: {
			// Services can use wrapper patterns
			"nodus/require-async-orchestration": [
				"error",
				{
					recognizeWrappers: true,
					allowIn: ["src/platform/services/", "src/shared/services/"],
				},
			],
			// Services must use proper observability
			"nodus/require-observability-compliance": [
				"error",
				{
					enforceForensic: true,
					enforceActionDispatcher: true,
					enforceOrchestrator: true,
				},
			],
			// Services require performance budgets
			"nodus/require-performance-budget": "error",
		},
	},

	// Storage layer configuration
	{
		files: [
			"src/platform/storage/**/*.{js,mjs,cjs}",
			"src/shared/storage/**/*.{js,mjs,cjs}",
		],
		rules: {
			// Storage adapters can access storage directly
			"nodus/require-action-dispatcher": [
				"error",
				{
					enforceStorage: false, // Storage layer implements the abstraction
					enforceCache: true,
					enforceUI: false,
				},
			],
			// Storage operations need forensic compliance
			"nodus/require-observability-compliance": [
				"error",
				{
					enforceForensic: true,
					enforceActionDispatcher: false, // Storage implements ActionDispatcher
					enforceOrchestrator: true,
				},
			],
		},
	},

	// Test configuration - more relaxed
	{
		files: [
			"**/*.test.{js,mjs,cjs,jsx,ts,tsx}",
			"**/*.spec.{js,mjs,cjs,jsx,ts,tsx}",
			"tests/**/*.{js,mjs,cjs,jsx,ts,tsx}",
			"test/**/*.{js,mjs,cjs,jsx,ts,tsx}",
			"__tests__/**/*.{js,mjs,cjs,jsx,ts,tsx}",
		],
		rules: {
			// Relaxed rules for tests
			"nodus/require-async-orchestration": "off",
			"nodus/require-action-dispatcher": "off",
			"nodus/require-observability-compliance": "off",
			"nodus/require-performance-budget": "off",
			"nodus/require-license-validation": "off",
			"nodus/require-signed-plugins": "off",
			"nodus/require-policy-compliance": "off",
			"nodus/require-policy-gate": "off",
			// Keep security rules for tests
			"nodus/no-direct-core-instantiation": "error",
			"nodus/no-external-scripts": "warn",
			"nodus/require-cds-transport": "warn",
		},
	},

	// Development tools configuration
	{
		files: [
			"src/devtools/**/*.{js,mjs,cjs}",
			"scripts/**/*.{js,mjs,cjs}",
			"tools/**/*.{js,mjs,cjs}",
			"build/**/*.{js,mjs,cjs}",
		],
		rules: {
			// Very relaxed for dev tools
			"nodus/require-async-orchestration": "off",
			"nodus/require-action-dispatcher": "off",
			"nodus/require-observability-compliance": "off",
			"nodus/require-performance-budget": "off",
			"nodus/require-license-validation": "off",
			"nodus/require-signed-plugins": "off",
			"nodus/no-external-scripts": "warn",
			"nodus/require-cds-transport": "off",
			"nodus/no-direct-dom-access": "off",
		},
	},

	// Configuration files
	{
		files: [
			"*.config.{js,mjs,cjs}",
			"**/*.config.{js,mjs,cjs}",
			".eslintrc.*",
			"vite.config.*",
			"webpack.config.*",
		],
		rules: {
			// All Nodus rules off for config files
			"nodus/require-async-orchestration": "off",
			"nodus/require-action-dispatcher": "off",
			"nodus/require-observability-compliance": "off",
			"nodus/no-direct-core-instantiation": "off",
			"nodus/require-performance-budget": "off",
			"nodus/require-license-validation": "off",
			"nodus/require-signed-plugins": "off",
			"nodus/no-external-scripts": "off",
			"nodus/require-cds-transport": "off",
		},
	},

	// Exception handling configuration
	nodusExceptions,
];
