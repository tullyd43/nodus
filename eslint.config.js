/* eslint-disable nodus/no-direct-dom-access */
/* eslint-disable no-unused-vars */
/* eslint-env node */
// eslint.config.js — ESLint v9+ (Enterprise Observability Edition)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginPromise from "eslint-plugin-promise";
import pluginSecurity from "eslint-plugin-security";
import pluginUnusedImports from "eslint-plugin-unused-imports";

// Use a static import for the in-repo nodus plugin so the plugin object is
// synchronously available to ESLint when it loads this config. Dynamic
// top-level await imports can be fragile in some ESLint integrations.
import nodusPlugin from "./tools/eslint/eslint-plugin-nodus/index.js";

// V8.0 Parity: Correctly resolve paths relative to this config file's location.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overrideCIPath = path.resolve(
	__dirname,
	"tools/eslint/.eslint-override.ci.json"
);
const overrideCI = {
	...JSON.parse(fs.readFileSync(overrideCIPath, "utf8")),
	plugins: {
		nodus: nodusPlugin,
	},
};

// Dynamically import the exception file from the correct relative path.
import exceptions from "./tools/eslint/.eslint.config.exception.js";

// Force modern parser
process.env.ESLINT_USE_FLAT_CONFIG = "true";

// Enterprise license detection for rule enforcement
const isEnterpriseEnvironment =
	process.env.NODUS_LICENSE_TYPE === "enterprise" ||
	process.env.NODE_ENV === "production";

export default [
	js.configs.recommended,

	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"docs/**",
			"tools/vite/**",
		],
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
				AbortController: "readonly",
				IntersectionObserver: "readonly",
				requestAnimationFrame: "readonly",
				cancelAnimationFrame: "readonly",
				MutationObserver: "readonly",
				ResizeObserver: "readonly",
				HTMLElement: "readonly",
				fetch: "readonly",
				URL: "readonly",
				Blob: "readonly",
				FileReader: "readonly",
				DOMParser: "readonly",
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
			// Register the updated nodus plugin with enterprise rules
			nodus: nodusPlugin,
			// Backwards-compatible alias
			"nodus-rules": nodusPlugin,
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

			"no-warning-comments": [
				"warn",
				{ terms: ["todo", "fixme", "xxx"], location: "start" },
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

			// --- Core Architecture Rules ---
			"nodus/no-direct-core-instantiation": "error",
			"nodus/require-async-orchestration": "error",
			"nodus/require-action-dispatcher": "error",
			"nodus/prefer-alias-imports": "error",

			// --- Security & Access Control Rules ---
			"nodus/no-direct-dom-access": "error",
			"nodus/no-external-scripts": "error",
			"nodus/enforce-canonical-sanitizer": "error",
			"nodus/no-security-string-literals": "error",
			"nodus/require-cds-transport": "error",

			// --- Platform Integration Rules ---
			"nodus/no-manual-platform-calls": "error",
			"nodus/require-observability-compliance": "error",
			"nodus/require-policy-gate": "warn",
			"nodus/require-policy-compliance": "error",

			// --- Performance & Quality Rules ---
			"nodus/require-performance-budget": "warn",
		},
	},

	// Enterprise-specific configuration
	{
		files: ["src/platform/enterprise/**/*.js", "src/enterprise/**/*.js"],
		rules: {
			// Stricter rules for enterprise code
			"nodus/require-license-validation": "error",
			"nodus/require-signed-plugins": "error",
			"nodus/require-observability-compliance": "error",
			"nodus/require-performance-budget": "error",
			"nodus/require-policy-compliance": [
				"error",
				{ enforceLevel: "enterprise" },
			],
		},
	},

	// Performance-critical files
	{
		files: [
			"src/platform/performance/**/*.js",
			"src/platform/cache/**/*.js",
			"src/platform/storage/**/*.js",
			"src/grid/**/*.js",
		],
		rules: {
			"nodus/require-performance-budget": "error",
			"nodus/require-policy-compliance": "error",
			// Extra strict performance rules
			"no-unused-expressions": "error",
			"prefer-template": "error",
		},
	},

	// Security-sensitive files
	{
		files: [
			"src/platform/security/**/*.js",
			"src/platform/crypto/**/*.js",
			"src/platform/auth/**/*.js",
		],
		rules: {
			"nodus/require-observability-compliance": "error",
			"nodus/no-security-string-literals": "error",
			"nodus/require-policy-gate": "error",
			"security/detect-object-injection": "error",
		},
	},

	// Development and testing - more lenient rules
	{
		files: [
			"tests/**/*.js",
			"src/devtools/**/*.js",
			"scripts/**/*.js",
			"tools/**/*.js",
		],
		rules: {
			"nodus/require-license-validation": "off",
			"nodus/require-observability-compliance": "warn",
			"nodus/require-performance-budget": "off",
			"nodus/require-signed-plugins": "off",
			"no-console": "off",
		},
	},

	{
		...exceptions,
		plugins: {
			nodus: nodusPlugin,
		},
	},

	// CI tolerant mode for gradual adoption
	process.env.ESLINT_MODE === "tolerant"
		? {
				...overrideCI,
				rules: {
					...overrideCI.rules,
					// Gradually introduce new rules in CI
					"nodus/require-policy-compliance": "warn",
					"nodus/require-performance-budget": "warn",
					"nodus/require-license-validation": "warn",
					"nodus/require-signed-plugins": "warn",
					"nodus/require-observability-compliance": "warn",
				},
			}
		: {},
];
