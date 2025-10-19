import { keybindings, getKeymap } from '../../../src/core/editor/keybindings.js';

describe('keybindings', () => {
  test('should define standard shortcuts', () => {
    expect(keybindings['Mod-b']).toBeDefined();
    expect(keybindings['Mod-i']).toBeDefined();
    expect(keybindings['Mod-z']).toBeDefined();
  });

  test('getKeymap should return an object', () => {
    const keymap = getKeymap();
    expect(typeof keymap).toBe('object');
    expect(Object.keys(keymap).length).toBeGreaterThan(0);
  });
});