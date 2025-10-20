/**
 * @file src/core/editor/commands.js
 * @description ProseMirror commands for editor actions.
 * @requires prosemirror-commands
 * @requires prosemirror-state
 * @author Gemini
 * @version 1.0.0
 */

import {
	toggleMark,
	setBlockType,
	wrapIn,
	lift,
	splitBlock,
} from "prosemirror-commands";
import { schema } from "./schema.js";

/**
 * @description Toggles an inline format mark.
 * @param {string} markType - The type of mark to toggle.
 * @returns {Function} A ProseMirror command function.
 */
export const toggleFormat = (markType) => toggleMark(schema.marks[markType]);

/**
 * @description Sets the block type for the current selection.
 * @param {string} nodeType - The type of node to set.
 * @param {Object} [attrs={}] - The attributes for the node.
 * @returns {Function} A ProseMirror command function.
 */
export const setBlock = (nodeType, attrs = {}) =>
	setBlockType(schema.nodes[nodeType], attrs);

/**
 * @description Wraps the current block in another block.
 * @param {string} nodeType - The type of the wrapper node.
 * @returns {Function} A ProseMirror command function.
 */
export const wrapBlock = (nodeType) => wrapIn(schema.nodes[nodeType]);

/**
 * @description Inserts inline content with a mark.
 * @param {string} markType - The type of the mark.
 * @param {string} text - The text to insert.
 * @param {Object} [attrs={}] - The mark attributes.
 * @returns {Function} A ProseMirror command function.
 */
export const insertInline =
	(markType, text, attrs = {}) =>
	(state, dispatch) => {
		const { $from, $to } = state.selection;
		const range = $to.pos - $from.pos;

		const mark = schema.marks[markType].create(attrs);
		const textNode = schema.text(text, [mark]);

		const tr = state.tr.replaceSelectionWith(textNode);
		dispatch(tr);
		return true;
	};

/**
 * @description Inserts a block node.
 * @param {string} nodeType - The type of the node.
 * @param {Object} [attrs={}] - The node attributes.
 * @returns {Function} A ProseMirror command function.
 */
export const insertBlock =
	(nodeType, attrs = {}) =>
	(state, dispatch) => {
		const { $from } = state.selection;
		const node = schema.nodes[nodeType].create(attrs);

		const tr = state.tr.insert($from.pos, node);
		dispatch(tr);
		return true;
	};

/**
 * @description Inserts a heading.
 * @param {number} level - The heading level (1-6).
 * @returns {Function} A ProseMirror command function.
 */
export const insertHeading = (level) => setBlock("heading", { level });

/**
 * @description Inserts a code block.
 * @param {string} [language=""] - The programming language for syntax highlighting.
 * @returns {Function} A ProseMirror command function.
 */
export const insertCodeBlock =
	(language = "") =>
	(state, dispatch) => {
		const { $from, $to } = state.selection;

		// Get selected text if any
		let selectedText = "";
		if (!state.selection.empty) {
			const { $from: from, $to: to } = state.selection;
			state.doc.nodesBetween(from.pos, to.pos, (node) => {
				if (node.isText) {
					selectedText += node.text;
				}
			});
		}

		// Create code block content with backticks as editable text
		// Format: ```\ncontent\n```
		const backtickLine = state.schema.text("```");
		const contentLine = selectedText
			? state.schema.text(selectedText)
			: state.schema.text("");
		const closingLine = state.schema.text("```");

		// Create hardbreak nodes to separate lines
		const hardbreak = state.schema.nodes.hardbreak.create();

		// Build the code block with: opening backticks, hardbreak, content, hardbreak, closing backticks
		const content = [
			backtickLine,
			hardbreak,
			contentLine,
			hardbreak,
			closingLine,
		];

		// Create the code_block node
		const codeBlock = state.schema.nodes.code_block.create(
			{ language },
			content
		);

		// Replace current selection with code block
		const tr = state.tr.replaceWith(
			$from.before($from.depth),
			$to.after($to.depth),
			codeBlock
		);

		// Position cursor on the content line (after first hardbreak)
		const codeBlockPos = $from.before($from.depth);
		const cursorPos =
			codeBlockPos + backtickLine.nodeSize + hardbreak.nodeSize + 1;
		tr.setSelection(
			state.selection.constructor.near(tr.doc.resolve(cursorPos))
		);

		dispatch(tr);
		return true;
	};

/**
 * @description Inserts a horizontal rule.
 * @returns {Function} A ProseMirror command function.
 */
export const insertHorizontalRule = insertBlock("horizontal_rule");

/**
 * @description Inserts a bullet list.
 * @returns {Function} A ProseMirror command function.
 */
export const insertBulletList = wrapBlock("bullet_list");

/**
 * @description Inserts an ordered list.
 * @returns {Function} A ProseMirror command function.
 */
export const insertOrderedList = wrapBlock("ordered_list");

/**
 * @description Inserts a blockquote.
 * @returns {Function} A ProseMirror command function.
 */
export const insertBlockquote = wrapBlock("blockquote");

/**
 * @description Clears all formatting from the selection.
 * @param {EditorState} state - The current editor state.
 * @param {function} dispatch - The dispatch function.
 * @returns {boolean} - True if the command was applied.
 */
export const clearFormatting = (state, dispatch) => {
	const { $from, $to } = state.selection;
	let tr = state.tr;

	state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
		node.marks.forEach((mark) => {
			tr = tr.removeMark(pos, pos + node.nodeSize, mark.type);
		});
	});

	dispatch(tr);
	return true;
};

/**
 * @description Lifts the selection out of the parent block.
 * @type {Function}
 */
export const liftBlock = lift;

/**
 * @description Adds a link to the selection.
 * @param {string} href - The URL of the link.
 * @param {string} [title=""] - The title of the link.
 * @returns {Function} A ProseMirror command function.
 */
export const addLink =
	(href, title = "") =>
	(state, dispatch) => {
		const { $from, $to } = state.selection;

		const mark = schema.marks.link.create({ href, title });
		const tr = state.tr.addMark($from.pos, $to.pos, mark);

		dispatch(tr);
		return true;
	};

/**
 * @description Removes a link from the selection.
 * @param {EditorState} state - The current editor state.
 * @param {function} dispatch - The dispatch function.
 * @returns {boolean} - True if the command was applied.
 */
export const removeLink = (state, dispatch) => {
	const { $from, $to } = state.selection;

	const tr = state.tr.removeMark($from.pos, $to.pos, schema.marks.link);
	dispatch(tr);
	return true;
};

export default {
	toggleFormat,
	setBlock,
	wrapBlock,
	insertInline,
	insertBlock,
	insertHeading,
	insertCodeBlock,
	insertHorizontalRule,
	insertBulletList,
	insertOrderedList,
	insertBlockquote,
	clearFormatting,
	liftBlock,
	addLink,
	removeLink,
};
