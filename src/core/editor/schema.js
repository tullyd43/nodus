/**
 * @file src/core/editor/schema.js
 * @description ProseMirror schema definition for markdown-native editing
 * @dependencies prosemirror-model, prosemirror-schema-basic, prosemirror-schema-list
 * @pattern Schema configuration for bidirectional markdown sync
 */

import { Schema } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

/**
 * Extended schema with support for:
 * - Headings (h1-h6)
 * - Lists (bullet, ordered)
 * - Code blocks with language support
 * - Blockquotes
 * - All standard marks (em, strong, code, link)
 */
export const schema = new Schema({
  nodes: addListNodes(baseSchema.spec.nodes, 'block+'),
  marks: baseSchema.spec.marks,
});

export default schema;