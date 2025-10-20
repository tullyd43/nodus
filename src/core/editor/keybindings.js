/**
 * @file src/core/editor/keybindings.js
 * @description Keyboard shortcuts for editor
 * @dependencies prosemirror-keymap, prosemirror-history
 * @pattern Vim-like and standard editor shortcuts
 */

import { baseKeymap } from "prosemirror-commands";
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


// custom Enter handler
const handleEnterInCodeBlock = (state, dispatch) => {
	const { $from } = state.selection;

	// Check if cursor is inside code_block
	for (let d = $from.depth; d > 0; d--) {
		if ($from.node(d).type.name === "code_block") {
			// Insert newline instead of splitting block
			dispatch(state.tr.insertText("\n"));
			return true;
		}
	}

	// Not in code block, use default behavior
	return false;
};


/**
 * Standard markdown editor keybindings
 * Includes: formatting, navigation, undo/redo
 */
export const keybindings = {
  // custom keybinds
	"Enter": handleEnterInCodeBlock,

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
 * Get full keymap with base commands
 * @returns {Object} Complete keymap configuration
 */
export function getKeymap() {
	return {
		...keybindings,
		...baseKeymap,
	};
}

export default keybindings;
