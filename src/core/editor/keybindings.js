/**
 * @file src/core/editor/keybindings.js
 * @description Keyboard shortcuts for the editor.
 * @requires prosemirror-keymap
 * @requires prosemirror-history
 * @author Gemini
 * @version 1.0.0
 */

import { baseKeymap, splitBlock } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import {
	toggleFormat,
	insertHeading,
	insertCodeBlock,
	insertBulletList,
	insertOrderedList,
	addLink,
	clearFormatting,
} from "./commands.js";

/**
 * @description Custom Enter key handler for code blocks.
 *              Inserts a hard break inside code blocks, otherwise splits the block.
 * @param {EditorState} state - The current editor state.
 * @param {function} dispatch - The dispatch function.
 * @returns {boolean} - True if the command was applied.
 */
const handleEnterInCodeBlock = (state, dispatch) => {
	const { $from } = state.selection;

	// Check if cursor is inside code_block
	for (let d = $from.depth; d > 0; d--) {
		if ($from.node(d).type.name === "code_block") {
			console.log("✓ CODE_BLOCK DETECTED - inserting hardbreak");
			// Inside code block: insert hardbreak node instead of newline
			const breakNode = state.schema.nodes.hardbreak.create();
			const tr = state.tr.replaceSelectionWith(breakNode);
			dispatch(tr);
			return true;
		}
	}

	console.log("✗ NOT code_block - calling splitBlock");
	// Not in code block: use normal split behavior
	return splitBlock(state, dispatch);
};

/**
 * @description Standard markdown editor keybindings.
 *              Includes: formatting, navigation, undo/redo.
 * @type {Object<string, function>}
 */
export const keybindings = {
	// custom keybinds
	Enter: handleEnterInCodeBlock,

	// Formatting
	"Mod-b": toggleFormat("strong"),
	"Mod-i": toggleFormat("em"),
	"Mod-`": toggleFormat("code"),
	"Mod-k": (state, dispatch) => {
		// Handle link via dialog in component instead
		return false;
	},

	// Headings
	"Mod-Alt-1": insertHeading(1),
	"Mod-Alt-2": insertHeading(2),
	"Mod-Alt-3": insertHeading(3),

	// Lists
	"Mod-Shift-8": insertBulletList,
	"Mod-Shift-7": insertOrderedList,

	// Code
	"Mod-Shift-`": insertCodeBlock,

	// Clear
	"Mod-\\": clearFormatting,

	// Standard
	"Mod-z": undo,
	"Mod-Shift-z": redo,
	"Mod-y": redo,
};

/**
 * @description Get the full keymap with base commands.
 *              Custom Enter handler is prioritized over baseKeymap.
 * @returns {Object} The complete keymap configuration.
 */
export function getKeymap() {
	// Start with baseKeymap, then override with our custom keybindings
	const finalKeymap = { ...baseKeymap };

	// Explicitly add our keybindings, which will override any conflicts
	Object.assign(finalKeymap, keybindings);

	return finalKeymap;
}

export default keybindings;
