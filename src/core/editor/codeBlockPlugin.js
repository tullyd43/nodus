/**
 * @file src/core/editor/codeBlockPlugin.js
 * @description Plugin for code block UI enhancements
 * - Shows/hides backtick markers based on focus state
 * - Auto-unwraps code blocks if backticks are deleted
 * @dependencies prosemirror-state, prosemirror-view
 */

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

const codeBlockPluginKey = new PluginKey("codeBlock");

/**
 * Check if position is inside a code_block node
 */
function isInCodeBlock(state, pos) {
	let found = false;
	state.doc.nodesBetween(
		Math.max(0, pos - 20),
		Math.min(state.doc.content.size, pos + 20),
		(node, nodePos) => {
			if (
				node.type.name === "code_block" &&
				nodePos <= pos &&
				pos < nodePos + node.nodeSize
			) {
				found = true;
			}
		}
	);
	return found;
}

/**
 * Check if code block has valid opening and closing backticks
 * Valid = first child is "```" and last child is "```"
 * Can have 3 children (with content) or 4 children (empty with extra hardbreak)
 */
function validateCodeBlockBackticks(node) {
	if (node.type.name !== "code_block") {
		return { valid: false };
	}

	const content = node.content;
	// Need at least 3 children: ```, at least one hardbreak, ```
	if (content.childCount < 3) {
		return { valid: false };
	}

	const firstChild = content.firstChild;
	const lastChild = content.lastChild;

	// Check opening backticks
	const hasValidOpening =
		firstChild && firstChild.isText && firstChild.text === "```";

	// Check closing backticks
	const hasValidClosing =
		lastChild && lastChild.isText && lastChild.text === "```";

	return { valid: hasValidOpening && hasValidClosing };
}

/**
 * Unwrap a code block node back to paragraphs
 * Extracts middle content (skips opening and closing backticks)
 */
function unwrapCodeBlock(state, codeBlockNode) {
	const schema = state.schema;
	const content = [];
	let currentLineText = "";

	// Skip first child (opening backticks)
	// Process middle content
	// Skip last child (closing backticks)

	for (let i = 1; i < codeBlockNode.content.childCount - 1; i++) {
		const child = codeBlockNode.content.child(i);

		if (child.type.name === "hardbreak") {
			// End of line - create paragraph
			const p = schema.nodes.paragraph.create(
				null,
				currentLineText ? [schema.text(currentLineText)] : []
			);
			content.push(p);
			currentLineText = "";
		} else if (child.isText) {
			// Accumulate text
			currentLineText += child.text;
		}
	}

	// Add final paragraph if there's remaining text
	if (currentLineText) {
		const p = schema.nodes.paragraph.create(null, [
			schema.text(currentLineText),
		]);
		content.push(p);
	}

	// Ensure at least one paragraph
	if (content.length === 0) {
		content.push(schema.nodes.paragraph.create());
	}

	return content;
}

/**
 * Create code block plugin
 * Manages:
 * - Decorations to hide/show backticks based on focus state
 * - CSS classes for code block styling
 * - Auto-unwrapping when backticks are deleted
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
				const focusedCodeBlockPos = isInCodeBlock(newState, $from.pos)
					? $from.pos
					: null;

				return {
					focusedCodeBlockPos,
				};
			},
		},

		props: {
			decorations(state) {
				const { focusedCodeBlockPos } =
					codeBlockPluginKey.getState(state);
				const decorations = [];

				// Find all code_block nodes and add decorations
				state.doc.nodesBetween(
					0,
					state.doc.content.size,
					(node, pos) => {
						if (node.type.name === "code_block") {
							// Add class decoration to the code block node
							const isFocused =
								focusedCodeBlockPos !== null &&
								pos <= focusedCodeBlockPos &&
								focusedCodeBlockPos < pos + node.nodeSize;

							const nodeDecoration = Decoration.node(
								pos,
								pos + node.nodeSize,
								{
									class: isFocused
										? "code-block code-block-focused"
										: "code-block",
								}
							);
							decorations.push(nodeDecoration);

							// If NOT focused, add inline decorations to hide backticks
							if (!isFocused && node.content.childCount > 0) {
								// Hide opening backticks (first child)
								const firstChild = node.content.firstChild;
								if (
									firstChild &&
									firstChild.isText &&
									firstChild.text === "```"
								) {
									const startPos = pos + 1; // +1 to get inside the node
									decorations.push(
										Decoration.inline(
											startPos,
											startPos + firstChild.nodeSize,
											{ class: "backtick-hidden" }
										)
									);
								}

								// Hide closing backticks (last child)
								const lastChild = node.content.lastChild;
								if (
									lastChild &&
									lastChild.isText &&
									lastChild.text === "```"
								) {
									const lastPos =
										pos +
										node.nodeSize -
										lastChild.nodeSize -
										1; // -1 for closing
									decorations.push(
										Decoration.inline(
											lastPos,
											lastPos + lastChild.nodeSize,
											{ class: "backtick-hidden" }
										)
									);
								}
							}
						}
					}
				);

				return DecorationSet.create(state.doc, decorations);
			},
		},

		/**
		 * After transaction is applied, check for invalid code blocks and unwrap them
		 */
		appendTransaction(transactions, oldState, newState) {
			let tr = null;
			const invalidBlocks = [];

			newState.doc.nodesBetween(
				0,
				newState.doc.content.size,
				(node, pos) => {
					if (node.type.name === "code_block") {
						const { valid } = validateCodeBlockBackticks(node);
						if (!valid) {
							invalidBlocks.push({ node, pos });
						}
					}
				}
			);

			// If no invalid blocks, done
			if (invalidBlocks.length === 0) {
				return null;
			}

			// Process invalid blocks in reverse order to preserve positions
			tr = newState.tr;
			for (let i = invalidBlocks.length - 1; i >= 0; i--) {
				const { node, pos } = invalidBlocks[i];
				const unwrappedContent = unwrapCodeBlock(newState, node);
				tr.replaceWith(pos, pos + node.nodeSize, unwrappedContent);
			}

			return tr;
		},
	});
}

export default createCodeBlockPlugin;
