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
 */
function validateCodeBlockBackticks(node) {
	if (node.type.name !== "code_block") {
		return { valid: false };
	}

	const content = node.content;
	if (content.childCount < 5) {
		// Need at least: ```, hardbreak, content, hardbreak, ```
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

							const decoration = Decoration.node(
								pos,
								pos + node.nodeSize,
								{
									class: isFocused
										? "code-block code-block-focused"
										: "code-block",
								}
							);
							decorations.push(decoration);
						}
					}
				);

				return DecorationSet.create(state.doc, decorations);
			},
		},

		/**
		 * After transaction is applied, check for invalid code blocks and unwrap them
		 * NOTE: This is at plugin level, not inside props!
		 */
		appendTransaction(transactions, oldState, newState) {
			console.log("🔍 appendTransaction called, checking code blocks...");
			let tr = null;

			// Collect all invalid code blocks
			const invalidBlocks = [];
			let codeBlockCount = 0;

			newState.doc.nodesBetween(
				0,
				newState.doc.content.size,
				(node, pos) => {
					if (node.type.name === "code_block") {
						codeBlockCount++;
						const { valid } = validateCodeBlockBackticks(node);

						console.log(
							`  Code block #${codeBlockCount} at pos ${pos}:`,
							{
								valid,
								firstChild:
									node.content.firstChild?.text || "NONE",
								lastChild:
									node.content.lastChild?.text || "NONE",
								childCount: node.content.childCount,
							}
						);

						if (!valid) {
							console.log(`  ❌ Marking for unwrap`);
							invalidBlocks.push({ node, pos });
						} else {
							console.log(`  ✅ Valid, keeping`);
						}
					}
				}
			);

			console.log(
				`Found ${codeBlockCount} code blocks, ${invalidBlocks.length} invalid`
			);

			// If no invalid blocks, no need to do anything
			if (invalidBlocks.length === 0) {
				return null;
			}

			console.log(
				`🔄 Unwrapping ${invalidBlocks.length} invalid code blocks`
			);

			// Process invalid blocks in reverse order to preserve positions
			tr = newState.tr;
			for (let i = invalidBlocks.length - 1; i >= 0; i--) {
				const { node, pos } = invalidBlocks[i];
				const unwrappedContent = unwrapCodeBlock(newState, node);

				console.log(
					`  Replacing code block at ${pos} with ${unwrappedContent.length} paragraphs`
				);

				// Replace code block with unwrapped paragraphs
				tr.replaceWith(pos, pos + node.nodeSize, unwrappedContent);
			}

			return tr;
		},
	});
}

export default createCodeBlockPlugin;
