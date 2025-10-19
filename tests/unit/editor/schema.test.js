
// tests/unit/editor/schema.test.js
import { schema } from '../../../src/core/editor/schema.js';

describe('Editor Schema', () => {
  test('schema should have all required node types', () => {
    expect(schema.nodes.doc).toBeDefined();
    expect(schema.nodes.paragraph).toBeDefined();
    expect(schema.nodes.heading).toBeDefined();
    expect(schema.nodes.bullet_list).toBeDefined();
    expect(schema.nodes.ordered_list).toBeDefined();
    expect(schema.nodes.code_block).toBeDefined();
    expect(schema.nodes.blockquote).toBeDefined();
  });

  test('schema should have all required marks', () => {
    expect(schema.marks.em).toBeDefined();
    expect(schema.marks.strong).toBeDefined();
    expect(schema.marks.code).toBeDefined();
    expect(schema.marks.link).toBeDefined();
  });

  test('schema should parse HTML correctly', () => {
    const html = '<h1>Hello</h1><p>World</p>';
    // Test parsing logic
  });
});
