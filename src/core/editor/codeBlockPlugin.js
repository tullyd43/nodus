/**
 * @file src/core/editor/codeBlockPlugin.js
 * @description Plugin for code block UI enhancements.
 *              - Shows/hides backtick markers based on focus state
 * @requires prosemirror-state
 * @requires prosemirror-view
 * @author Gemini
 * @version 1.0.0
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * @description The plugin key for the code block plugin.
 * @type {PluginKey}
 */
const codeBlockPluginKey = new PluginKey('codeBlock');

/**
 * @description Check if a given position is inside a code_block node.
 * @param {EditorState} state - The editor state.
 * @param {number} pos - The position to check.
 * @returns {boolean} - True if the position is inside a code block, false otherwise.
 */
function isInCodeBlock(state, pos) {
	let found = false;
	state.doc.nodesBetween(Math.max(0, pos - 20), Math.min(state.doc.content.size, pos + 20), (node, nodePos) => {
		if (node.type.name === 'code_block' && nodePos <= pos && pos < nodePos + node.nodeSize) {
			found = true;
		}
	});
	return found;
}

/**
 * @description Create a new code block plugin.
 *              Manages:
 *              - Decorations to hide/show backticks based on focus state
 *              - CSS classes for code block styling
 * @returns {Plugin}
 */
export function createCodeBlockPlugin() {
	return new Plugin({
		key: codeBlockPluginKey,

		state: {
			init() {
				return {
					focusedCodeBlockPos: null,
				};
			},
			apply(tr, value, oldState, newState) {
				const { $from } = newState.selection;
				const focusedCodeBlockPos = isInCodeBlock(newState, $from.pos) ? $from.pos : null;

				return {
					focusedCodeBlockPos,
				};
			},
		},

		props: {
			decorations(state) {
				const { focusedCodeBlockPos } = codeBlockPluginKey.getState(state);
				const decorations = [];

				// Find all code_block nodes and add decorations
				state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
					if (node.type.name === 'code_block') {
						// Add class decoration to the code block node
						const isFocused = focusedCodeBlockPos !== null && pos <= focusedCodeBlockPos && focusedCodeBlockPos < pos + node.nodeSize;
						
						const decoration = Decoration.node(pos, pos + node.nodeSize, {
							class: isFocused ? 'code-block code-block-focused' : 'code-block',
						});
						decorations.push(decoration);
					}
				});

				return DecorationSet.create(state.doc, decorations);
			},
		},
	});
}

export default createCodeBlockPlugin;
