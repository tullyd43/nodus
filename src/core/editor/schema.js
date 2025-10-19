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
 * - Lists (bullet, ordered, task)
 * - Code blocks with language support
 * - Blockquotes
 * - Custom marks (highlight, custom link)
 * - Custom nodes (callout)
 */
export const schema = new Schema({
  nodes: addListNodes(
    {
      doc: {
        content: 'block+',
      },
      paragraph: {
        content: 'inline*',
        group: 'block',
        parseDOM: [{ tag: 'p' }],
        toDOM: () => ['p', 0],
      },
      heading: {
        attrs: { level: { default: 1 } },
        content: 'inline*',
        group: 'block',
        defining: true,
        parseDOM: [
          { tag: 'h1', attrs: { level: 1 } },
          { tag: 'h2', attrs: { level: 2 } },
          { tag: 'h3', attrs: { level: 3 } },
          { tag: 'h4', attrs: { level: 4 } },
          { tag: 'h5', attrs: { level: 5 } },
          { tag: 'h6', attrs: { level: 6 } },
        ],
        toDOM: (node) => [`h${node.attrs.level}`, 0],
      },
      blockquote: {
        content: 'block+',
        group: 'block',
        defining: true,
        parseDOM: [{ tag: 'blockquote' }],
        toDOM: () => ['blockquote', 0],
      },
      code_block: {
        attrs: {
          language: { default: '' },
        },
        content: 'text*',
        marks: '',
        group: 'block',
        defining: true,
        parseDOM: [
          {
            tag: 'pre',
            preserveWhitespace: 'full',
            getAttrs: (dom) => {
              const code = dom.querySelector('code');
              return {
                language: code?.getAttribute('data-language') || '',
              };
            },
          },
        ],
        toDOM: (node) => [
          'pre',
          [
            'code',
            { 'data-language': node.attrs.language },
            0,
          ],
        ],
      },
      horizontal_rule: {
        group: 'block',
        parseDOM: [{ tag: 'hr' }],
        toDOM: () => ['hr'],
      },
      text: {
        group: 'inline',
      },
      hard_break: {
        inline: true,
        group: 'inline',
        selectable: false,
        parseDOM: [{ tag: 'br' }],
        toDOM: () => ['br'],
      },
    },
    'bullet_list | ordered_list | list_item',
    'block+'
  ),

  marks: {
    em: {
      parseDOM: [
        { tag: 'i' },
        { tag: 'em' },
        { style: 'font-style=italic' },
      ],
      toDOM: () => ['em', 0],
    },
    strong: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight=bold' },
      ],
      toDOM: () => ['strong', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => ({
            href: dom.getAttribute('href'),
            title: dom.getAttribute('title'),
          }),
        },
      ],
      toDOM: (mark) => [
        'a',
        {
          href: mark.attrs.href,
          title: mark.attrs.title || '',
        },
        0,
      ],
    },
  },
});

export default schema;
