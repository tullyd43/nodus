import * as commands from '../../../src/core/editor/commands.js';

describe('commands', () => {
  test('should export all command functions', () => {
    expect(typeof commands.toggleFormat).toBe('function');
    expect(typeof commands.insertHeading).toBe('function');
    expect(typeof commands.insertCodeBlock).toBe('function');
    expect(typeof commands.insertBulletList).toBe('function');
    expect(typeof commands.insertOrderedList).toBe('function');
    expect(typeof commands.addLink).toBe('function');
    expect(typeof commands.clearFormatting).toBe('function');
  });

  test('toggleFormat should return a function', () => {
    const cmd = commands.toggleFormat('strong');
    expect(typeof cmd).toBe('function');
  });

  test('insertHeading should return a function', () => {
    const cmd = commands.insertHeading(1);
    expect(typeof cmd).toBe('function');
  });
});