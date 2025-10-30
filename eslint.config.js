/* eslint-env node */
// eslint.config.js  — ESLint v9+  (Vanilla JS | Node 22 | ESM)

import js from "@eslint/js";
import pluginImport from "eslint-plugin-import";
import pluginPromise from "eslint-plugin-promise";
import pluginSecurity from "eslint-plugin-security";
import pluginUnusedImports from "eslint-plugin-unused-imports";

// Force modern parser
process.env.ESLINT_USE_FLAT_CONFIG = "true";

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
		},
	},
];
