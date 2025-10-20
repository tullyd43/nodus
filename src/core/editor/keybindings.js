/**
 * @file src/core/editor/keybindings.js
 * @description Keyboard shortcuts for editor
 * @dependencies prosemirror-keymap, prosemirror-history
 * @pattern Vim-like and standard editor shortcuts
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

// custom Enter handler
const handleEnterInCodeBlock = (state, dispatch) => {
	const { $from } = state.selection;

	// Check if cursor is inside code_block
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node.type.name === "code_block") {
			// Check if cursor is at the very end of the code block content
			const isAtEnd = $from.parentOffset === node.content.size;

			if (isAtEnd) {
				console.log("✓ AT END OF CODE_BLOCK - moving cursor outside");

				// Move cursor to the position right after the code block
				// Don't modify the code block at all
				const codeBlockEnd = $from.before(d) + node.nodeSize;

				const tr = state.tr;
				const newSelection = state.selection.constructor.near(
					tr.doc.resolve(codeBlockEnd)
				);
				tr.setSelection(newSelection);

				// Then insert a new paragraph and place cursor there
				const newPara = state.schema.nodes.paragraph.create();
				tr.insert(codeBlockEnd, newPara);

				// Set selection to the new paragraph
				tr.setSelection(
					state.selection.constructor.near(
						tr.doc.resolve(codeBlockEnd + 1)
					)
				);

				dispatch(tr);
				return true;
			}

			// Inside code block but not at the end - insert hardbreak
			console.log("✓ INSIDE CODE_BLOCK - inserting hardbreak");
			const breakNode = state.schema.nodes.hardbreak.create();
			const tr = state.tr.replaceSelectionWith(breakNode);
			dispatch(tr);
			return true;
		}
	}

	console.log("✗ NOT in code_block - calling splitBlock");
	// Not in code block: use normal split behavior
	return splitBlock(state, dispatch);
};

/**
 * Standard markdown editor keybindings
 * Includes: formatting, navigation, undo/redo
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
 * Get full keymap with base commands
 * Custom Enter handler is prioritized over baseKeymap
 * @returns {Object} Complete keymap configuration
 */
export function getKeymap() {
	// Start with baseKeymap, then override with our custom keybindings
	const finalKeymap = { ...baseKeymap };

	// Explicitly add our keybindings, which will override any conflicts
	Object.assign(finalKeymap, keybindings);

	return finalKeymap;
}

export default keybindings;
