/**
 * @file src/core/editor/inputrules.js
 * @description Input rules for automatic markdown syntax detection
 * @dependencies prosemirror-inputrules
 * @pattern Standard markdown input rules: headings, lists, blockquotes
 */

import {
	inputRules,
	wrappingInputRule,
	textblockTypeInputRule,
} from "prosemirror-inputrules";
import { schema } from "./schema.js";

/**
 * Create standard markdown input rules
 * - Headings: # text, ## text, etc.
 * - Blockquotes: > text
 * - Bullet lists: - or * text
 * - Ordered lists: 1. text
 * @returns {Plugin} Input rules plugin
 */
export function createInputRules() {
	return inputRules({
		rules: [
			textblockTypeInputRule(
				/^(#{1,6})\s$/,
				schema.nodes.heading,
				(match) => ({
					level: match[1].length,
				})
			),
			wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
			wrappingInputRule(/^\s*([*-])\s$/, schema.nodes.bullet_list),
			wrappingInputRule(/^\s*(1\.)\s$/, schema.nodes.ordered_list),
		],
	});
}

export default createInputRules;
