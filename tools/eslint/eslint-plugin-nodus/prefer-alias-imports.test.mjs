import { RuleTester } from "eslint";

import preferAliasImports from "./prefer-alias-imports.js";

const tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
});

tester.run("prefer-alias-imports", preferAliasImports, {
	valid: [
		{
			code: "import { SafeDOM } from '@shared/lib/SafeDOM.js';",
			filename: "/workspace/src/app/example.js",
		},
		{
			code: "import { something } from './local-module.js';",
			filename: "/workspace/src/app/example.js",
		},
		{
			code: "import path from 'node:path';",
			filename: "/workspace/src/app/example.js",
		},
		{
			code: "import alias from '@features/grid/CompleteGridSystem.js';",
			filename: "/workspace/src/app/example.js",
		},
		{
			code: "import outside from '../scripts/tool';",
			filename: "/workspace/scripts/utility.js", // rule inactive outside /src/
		},
	],
	invalid: [
		{
			code: "import legacy from '@core/security/ForensicLogger.js';",
			filename: "/workspace/src/security/example.js",
			errors: [
				{
					messageId: "legacyAlias",
					data: { source: "@core/security/ForensicLogger.js" },
				},
			],
		},
		{
			code: "import helper from './util';",
			filename: "/workspace/src/app/example.js",
			errors: [
				{
					messageId: "missingExtension",
					data: { source: "./util" },
				},
			],
		},
		{
			code: "import shim from '../shared/index.js';",
			filename: "/workspace/src/app/example.js",
			errors: [
				{
					messageId: "noIndex",
					data: { source: "../shared/index.js" },
				},
			],
		},
	],
});
