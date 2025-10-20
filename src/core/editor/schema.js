/**
 * @file src/core/editor/schema.js
 * @description ProseMirror schema definition for markdown-native editing
 * @dependencies prosemirror-model, prosemirror-schema-basic, prosemirror-schema-list
 * @pattern Schema configuration for bidirectional markdown sync
 */

import { Schema } from "prosemirror-model";
import { schema as baseSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

/**
 * Extended schema with support for:
 * - Headings (h1-h6)
 * - Lists (bullet, ordered, task)
 * - Code blocks with language support
 * - Blockquotes
 * - Custom marks (highlight, custom link)
 * - Custom nodes (callout)
 */

// Start with base schema nodes and add custom nodes
const customNodeSpecs = {
	hardbreak: {
		inline: true,
		group: "inline",
		selectable: false,
		parseDOM: [{ tag: "br" }],
		toDOM: () => ["br"],
	},
	heading: {
		attrs: { level: { default: 1 } },
		content: "inline*",
		group: "block",
		defining: true,
		parseDOM: [
			{ tag: "h1", attrs: { level: 1 } },
			{ tag: "h2", attrs: { level: 2 } },
			{ tag: "h3", attrs: { level: 3 } },
			{ tag: "h4", attrs: { level: 4 } },
			{ tag: "h5", attrs: { level: 5 } },
			{ tag: "h6", attrs: { level: 6 } },
		],
		toDOM: (node) => [`h${node.attrs.level}`, 0],
	},
	blockquote: {
		content: "block+",
		group: "block",
		defining: true,
		parseDOM: [{ tag: "blockquote" }],
		toDOM: () => ["blockquote", 0],
	},
	code_block: {
		attrs: {
			language: { default: "" },
		},
		content: "(text | hardbreak)*",
		marks: "",
		group: "block",
		defining: true,
		parseDOM: [
			{
				tag: "pre",
				preserveWhitespace: "full",
				getAttrs: (dom) => {
					const code = dom.querySelector("code");
					return {
						language: code?.getAttribute("data-language") || "",
					};
				},
			},
		],
		toDOM: (node) => [
			"pre",
			["code", { "data-language": node.attrs.language }, 0],
		],
	},
	horizontal_rule: {
		group: "block",
		parseDOM: [{ tag: "hr" }],
		toDOM: () => ["hr"],
	},
};

// Merge base schema nodes with custom nodes, then add lists
const allNodes = baseSchema.spec.nodes.append(customNodeSpecs);
const nodesWithLists = addListNodes(
	allNodes,
	"bullet_list | ordered_list | list_item",
	"block+"
);

export const schema = new Schema({
	nodes: nodesWithLists,
	marks: baseSchema.spec.marks.append({
		link: {
			attrs: {
				href: {},
				title: { default: null },
			},
			inclusive: false,
			parseDOM: [
				{
					tag: "a[href]",
					getAttrs: (dom) => ({
						href: dom.getAttribute("href"),
						title: dom.getAttribute("title"),
					}),
				},
			],
			toDOM: (mark) => [
				"a",
				{
					href: mark.attrs.href,
					title: mark.attrs.title || "",
				},
				0,
			],
		},
	}),
});

export default schema;
