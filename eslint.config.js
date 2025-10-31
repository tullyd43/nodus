/* eslint-env node */
// eslint.config.js  — ESLint v9+  (Vanilla JS | Node 22 | ESM)

import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginPromise from "eslint-plugin-promise";
import pluginSecurity from "eslint-plugin-security";
import pluginUnusedImports from "eslint-plugin-unused-imports";

// Force modern parser
process.env.ESLINT_USE_FLAT_CONFIG = "true";

// V8.0 Parity: Mandate 1.3 - Custom ESLint rule to prevent direct instantiation of core services.
const FORBIDDEN_CORE_CLASSES = new Set([
	"SecurityManager",
	"MetricsRegistry",
	"EventFlowEngine",
	"ForensicLogger",
	"ErrorHelpers",
	"IdManager",
	"CacheManager",
	"SystemPolicies",
	"DatabaseOptimizer",
	"ManifestPluginSystem",
	"QueryService",
	"EmbeddingManager",
	"ValidationLayer",
	"ComponentDefinitionRegistry",
	"ConditionRegistry",
	"ActionHandlerRegistry",
	"AdaptiveRenderer",
	"BuildingBlockRenderer",
	"ExtensionManager",
]);

export default [
	js.configs.recommended,

	{
		ignores: ["dist/**", "node_modules/**", "coverage/**"],
	},

	{
		files: ["**/*.js", "**/*.mjs"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			parserOptions: {
				ecmaVersion: "latest",
				ecmaFeatures: {
					classFields: true,
					privateIn: true,
				},
			},
			globals: {
				// Node + Browser Hybrid Environment
				window: "readonly",
				document: "readonly",
				console: "readonly",
				global: "readonly",
				process: "readonly",
				// Web APIs
				performance: "readonly",
				navigator: "readonly",
				localStorage: "readonly",
				sessionStorage: "readonly",
				indexedDB: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				clearInterval: "readonly",
				requestAnimationFrame: "readonly",
				cancelAnimationFrame: "readonly",
				MutationObserver: "readonly",
				ResizeObserver: "readonly",
				HTMLElement: "readonly",
				fetch: "readonly",
				URL: "readonly",
				Blob: "readonly",
				FileReader: "readonly",
				CustomEvent: "readonly",
				crypto: "readonly",
				TextEncoder: "readonly",
				TextDecoder: "readonly",
				WebSocket: "readonly",
				PerformanceObserver: "readonly",
				btoa: "readonly",
				atob: "readonly",
				confirm: "readonly",
				test: "readonly",
				expect: "readonly",
				ErrorEvent: "readonly",
			},
		},
		plugins: {
			import: pluginImport,
			promise: pluginPromise,
			security: pluginSecurity,
			"unused-imports": pluginUnusedImports,
			// V8.0 Parity: Mandate 1.3 - Define the custom rule plugin inline.
			"nodus-rules": {
				rules: {
					"no-direct-core-instantiation": {
						meta: {
							type: "problem",
							docs: {
								description:
									"Disallow direct instantiation of core services. They must be accessed via the stateManager.",
								category: "Best Practices",
								recommended: true,
							},
							schema: [],
						},
						create(context) {
							return {
								NewExpression(node) {
									if (
										node.callee.type === "Identifier" &&
										FORBIDDEN_CORE_CLASSES.has(
											node.callee.name
										)
									) {
										context.report({
											node,
											message: `Direct instantiation of core service '${node.callee.name}' is forbidden. Access it via the stateManager.`,
										});
									}
								},
							};
						},
					},
				},
			},
		},
		rules: {
			// --- General Quality ---
			"no-console": [
				"warn",
				{
					allow: [
						"warn",
						"error",
						"info",
						"debug",
						"log",
						"trace",
						"dir",
						"group",
						"groupEnd",
					],
				},
			],
			"no-debugger": "error",

			// --- Imports & Organization ---
			"import/order": [
				"warn",
				{
					groups: [
						"builtin",
						"external",
						"internal",
						["parent", "sibling", "index"],
					],
					"newlines-between": "always",
					alphabetize: { order: "asc", caseInsensitive: true },
				},
			],
			"import/no-duplicates": "warn",

			// --- Modern JS ---
			"prefer-const": "warn",
			"no-var": "error",
			"object-shorthand": "warn",
			"arrow-body-style": ["warn", "as-needed"],

			// --- Promises & Security ---
			"promise/no-nesting": "warn",
			"security/detect-object-injection": "off",

			// --- Cleanup ---
			"unused-imports/no-unused-imports": "error",
			"no-unused-vars": [
				"warn",
				{ args: "none", ignoreRestSiblings: true },
			],
			"no-case-declarations": "off",
			"no-control-regex": "off",
			"no-empty": "warn",

			// --- Custom Project Rules ---
			"nodus-rules/no-direct-core-instantiation": "error",
		},
	},
];
