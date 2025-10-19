import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default [
	{
		ignores: ["node_modules/**", "dist/**", "build/**"],
	},
	{
		files: ["src/**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		plugins: {
			jsdoc,
		},
		rules: {
			...js.configs.recommended.rules,
			"jsdoc/require-description": "warn",
			"jsdoc/require-param-description": "warn",
			"jsdoc/require-returns-description": "warn",
			"jsdoc/require-returns": ["warn", { forceReturnsWithAsync: true }],
			"jsdoc/require-param-type": "warn",
			"jsdoc/require-returns-type": "warn",
			"jsdoc/valid-types": "warn",
			"jsdoc/check-tag-names": [
				"warn",
				{ definedTags: ["dependencies", "pattern"] },
			],
			"jsdoc/check-types": "warn",
			"jsdoc/reject-any-type": "warn",
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
		},
	},
];