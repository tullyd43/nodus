/**
 * @file src/core/editor/commands.js
 * @description ProseMirror commands for editor actions
 * @dependencies prosemirror-commands, prosemirror-state
 * @pattern Command patterns following ProseMirror conventions
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
 * Toggle inline formatting
 * @param {string} markType - Type of mark to toggle
 * @returns {Function} Command function
 */
export const toggleFormat = (markType) => toggleMark(schema.marks[markType]);

/**
 * Set block type (heading level, code block, etc.)
 * @param {string} nodeType - Type of node
 * @param {Object} attrs - Attributes for the node
 * @returns {Function} Command function
 */
export const setBlock = (nodeType, attrs = {}) =>
	setBlockType(schema.nodes[nodeType], attrs);

/**
 * Wrap current block in another block (list, quote)
 * @param {string} nodeType - Type of wrapper node
 * @returns {Function} Command function
 */
export const wrapBlock = (nodeType) => wrapIn(schema.nodes[nodeType]);

/**
 * Insert inline content (link, code)
 * @param {string} markType - Type of mark
 * @param {string} text - Text to insert
 * @param {Object} attrs - Mark attributes
 * @returns {Function} Command function
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
 * Insert block content (callout, divider, etc.)
 * @param {string} nodeType - Type of node
 * @param {Object} attrs - Node attributes
 * @returns {Function} Command function
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
 * Insert heading
 * @param {number} level - Heading level (1-6)
 * @returns {Function} Command function
 */
export const insertHeading = (level) => setBlock("heading", { level });

/**
 * Insert code block - creates a code_block node with editable backticks
 * Uses plugin to show/hide backticks based on focus state
 * @param {string} language - Programming language for syntax highlighting
 * @returns {Function} Command function
 */
export const insertCodeBlock =
	(language = "") =>
	(state, dispatch) => {
		const { $from, $to } = state.selection;

		// Get selected content, preserving line breaks
		const selectedContent = [];
		if (!state.selection.empty) {
			const { $from: from, $to: to } = state.selection;
			let currentLineText = "";

			state.doc.nodesBetween(from.pos, to.pos, (node, nodePos) => {
				if (node.isText) {
					// Add text to current line
					currentLineText += node.text;
				} else if (
					node.type.name === "paragraph" ||
					node.type.name === "heading"
				) {
					// Paragraph boundary - if we have accumulated text, push it
					if (currentLineText) {
						selectedContent.push({
							type: "text",
							value: currentLineText,
						});
						currentLineText = "";
					}
					// Add hardbreak to separate paragraphs (except at the end)
					if (selectedContent.length > 0) {
						selectedContent.push({ type: "break" });
					}
				}
			});

			// Don't forget the last accumulated text
			if (currentLineText) {
				selectedContent.push({ type: "text", value: currentLineText });
			}
		}

		// Create code block content with backticks as editable text
		// Format: ```\n[content with line breaks]\n```
		const backtickLine = state.schema.text("```");
		const closingLine = state.schema.text("```");
		const hardbreak = state.schema.nodes.hardbreak.create();

		// Build content array with preserved line breaks
		const content = [];
		content.push(backtickLine);
		content.push(hardbreak);

		// Add selected content with hardbreaks between lines
		if (selectedContent.length > 0) {
			selectedContent.forEach((item, index) => {
				if (item.type === "text") {
					content.push(state.schema.text(item.value));
				} else if (item.type === "break") {
					content.push(hardbreak);
				}
			});
		}

		content.push(hardbreak);
		content.push(closingLine);

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

		// Position cursor after opening backticks and first hardbreak
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
 * Insert horizontal rule
 * @returns {Function} Command function
 */
export const insertHorizontalRule = insertBlock("horizontal_rule");

/**
 * Insert bullet list
 * @returns {Function} Command function
 */
export const insertBulletList = wrapBlock("bullet_list");

/**
 * Insert ordered list
 * @returns {Function} Command function
 */
export const insertOrderedList = wrapBlock("ordered_list");

/**
 * Insert blockquote
 * @returns {Function} Command function
 */
export const insertBlockquote = wrapBlock("blockquote");

/**
 * Clear formatting (remove all marks)
 * @returns {Function} Command function
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
 * Lift selection out of parent block
 * @returns {Function} Command function
 */
export const liftBlock = lift;

/**
 * Add link to selection
 * @param {string} href - URL
 * @param {string} title - Link title
 * @returns {Function} Command function
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
 * Remove link from selection
 * @returns {Function} Command function
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
