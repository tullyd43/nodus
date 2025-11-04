/**
 * @file Rule enforcing explicit alias imports (or direct file fallbacks) without legacy shims.
 */

const LEGACY_ALIASES = new Set(["@core", "@core/state"]);
const EXTENSION_REGEX = /\.(js|mjs|cjs)$/i;
const INDEX_REGEX = /\/index\.(js|mjs|cjs)$/i;
const JSDOC_IMPORT_REGEX = /import\((?:'|")([^'"]+)(?:'|")\)/g;
const JSDOC_PRIVATE_TAG = /@private\b/;

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Enforce canonical alias or concrete-file import usage in JSDoc private field type imports only (import('...') in @private declarations).",
			recommended: false,
		},
		schema: [],
		messages: {
			legacyAlias:
				"JSDoc import '{{source}}' uses a legacy alias/shim. Prefer canonical aliases (e.g. '@shared/...') or direct file paths.",
			missingExtension:
				"JSDoc import '{{source}}' must target a concrete file (include the .js/.mjs/.cjs extension).",
			noIndex:
				"JSDoc import '{{source}}' references an index shim. Point to the concrete module instead.",
		},
	},
	create(context) {
		const filename = context.getFilename();
		const normalized = filename.replace(/\\/g, "/");
		const enforceRule = normalized.includes(`/src/`);

		if (!enforceRule) {
			return {};
		}

		return {
			Program() {
				// Enforce the import rules only for JSDoc private field declarations that use import('...') types.
				const sourceCode = context.getSourceCode();
				const comments = sourceCode.getAllComments();

				comments.forEach((comment) => {
					// Only consider JSDoc-style block comments (/** ... */)
					if (comment.type !== "Block") return;
					if (!comment.value.startsWith("*")) return; // not JSDoc

					const text = comment.value;
					if (!JSDOC_PRIVATE_TAG.test(text)) return; // only private field declarations

					let match;
					while ((match = JSDOC_IMPORT_REGEX.exec(text)) !== null) {
						const source = match[1];
						if (!source) continue;

						// Ignore bare module specifiers
						if (
							!source.startsWith("@") &&
							!source.startsWith(".")
						) {
							continue;
						}

						const topLevel = source.split("/")[0];
						if (LEGACY_ALIASES.has(topLevel)) {
							context.report({
								loc: comment.loc,
								messageId: "legacyAlias",
								data: { source },
							});
							continue;
						}

						if (INDEX_REGEX.test(source)) {
							context.report({
								loc: comment.loc,
								messageId: "noIndex",
								data: { source },
							});
							continue;
						}

						if (!EXTENSION_REGEX.test(source)) {
							context.report({
								loc: comment.loc,
								messageId: "missingExtension",
								data: { source },
							});
						}
					}
				});
			},
		};
	},
};
