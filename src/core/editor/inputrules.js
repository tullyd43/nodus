/**
 * @file src/core/editor/inputrules.js
 * @description InputRules for automatic markdown syntax detection and conversion.
 * @requires prosemirror-inputrules
 * @author Gemini
 * @version 1.0.0
 */

import {
	inputRules,
	wrappingInputRule,
	textblockTypeInputRule,
	InputRule,
} from "prosemirror-inputrules";
import { Fragment } from "prosemirror-model";
import { schema } from "./schema.js";

/**
 * Custom code block input rule that preserves backticks
 * When user types ```, creates proper code block structure with backticks as content
 */
function createCodeBlockRule() {
	return new InputRule(/^```\s?$/, (state, match, start, end) => {
		// Create code block: ``` + hardbreak + hardbreak + ```
		// Two hardbreaks create the visual empty line between backticks
		let content = Fragment.empty;
		content = content.append(Fragment.from(schema.text("```")));
		content = content.append(
			Fragment.from(schema.nodes.hardbreak.create())
		);
		content = content.append(
			Fragment.from(schema.nodes.hardbreak.create())
		); // Second one for empty line
		content = content.append(Fragment.from(schema.text("```")));

		const codeBlock = schema.nodes.code_block.create(null, content);

		// Replace from line start to end of line
		const $from = state.doc.resolve(start);
		const lineStart = $from.start();
		const lineEnd = $from.end();

		const tr = state.tr.replaceWith(lineStart, lineEnd, codeBlock);

		// Position cursor on the empty line (after first hardbreak)
		// Structure: text("```")[4] + hardbreak[1] + hardbreak[1] + text("```")[4]
		// We want: lineStart + 1 (enter) + 4 (past text) + 1 (past first hardbreak) = lineStart + 6
		const cursorPos = lineStart + 1 + 4 + 1; // = lineStart + 6
		tr.setSelection(
			state.selection.constructor.near(tr.doc.resolve(cursorPos))
		);

		return tr;
	});
}

/**
 * @description Creates a ProseMirror plugin for handling markdown-style input rules.
 *              Detects patterns like:
 *              - # for h1, ## for h2, etc.
 *              - > for blockquote
 *              - ``` for code block (CUSTOM RULE with Fragment.from())
 *              - - or * for bullet list
 *              - 1. for ordered list
 * @returns {Plugin}
 */
export function createInputRules() {
	return inputRules({
		rules: [
			// Headings: # text
			textblockTypeInputRule(
				/^(#{1,6})\s$/,
				schema.nodes.heading,
				(match) => ({
					level: match[1].length,
				})
			),

			// Code block: ``` on its own line (CUSTOM RULE - preserves backticks)
			createCodeBlockRule(),

			// Blockquote: > text
			wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),

			// Bullet list: - or * at start
			wrappingInputRule(/^\s*([*-])\s$/, schema.nodes.bullet_list),

			// Ordered list: 1. at start
			wrappingInputRule(/^\s*(1\.)\s$/, schema.nodes.ordered_list),
		],
	});
}

export default createInputRules;
