/**
 * @file src/core/editor/inputrules.js
 * @description InputRules for automatic markdown syntax detection and conversion
 * @dependencies prosemirror-inputrules
 * @pattern Auto-convert markdown syntax to nodes as user types
 */

import { inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import { schema } from './schema.js';

/**
 * Create input rules for markdown syntax
 * Detects patterns like:
 * - # for h1, ## for h2, etc.
 * - > for blockquote
 * - ``` for code block
 * - - or * for bullet list
 * - 1. for ordered list
 */
export function createInputRules() {
  return inputRules({
    rules: [
      // Headings: # text
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
        level: match[1].length,
      })),

      // Code block: ``` on its own line
      textblockTypeInputRule(/^```\s?$/, schema.nodes.code_block),

      // Blockquote: > text
      wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),

      // Bullet list: - or * at start
      wrappingInputRule(/^\s*([*-])\s$/, schema.nodes.bullet_list),

      // Ordered list: 1. at start
      wrappingInputRule(/^\s*(1\.)\s$/, schema.nodes.ordered_list),
    ],
  });
}

export default createInputRules;
