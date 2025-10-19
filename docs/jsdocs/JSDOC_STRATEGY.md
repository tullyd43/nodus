# JSDoc Strategy & Configuration
## Nodus - Organizational Ecosystem Application

---

## Overview

This document establishes the JSDoc standard for the entire project. All JavaScript files will follow this convention for:
- Code documentation
- Type safety (without TypeScript)
- IDE autocomplete support
- Generated API documentation

---

## JSDoc Strategy

### Goals

✅ **Clarity** - Clear contracts for every function  
✅ **Safety** - Type hints prevent runtime errors  
✅ **Discoverability** - IDE autocomplete works perfectly  
✅ **Maintainability** - Future developers understand intent  
✅ **Documentation** - Automate API docs generation  

### Core Principles

1. **Document the WHY, not the obvious**
   ```javascript
   // ❌ DON'T
   /**
    * Gets the user name
    * @param {Object} user - The user object
    * @returns {string} The user name
    */
   
   // ✅ DO
   /**
    * Retrieves the display name for a user.
    * Returns "Anonymous" if user has not set a display name.
    * @param {Object} user - User object from database
    * @param {string} user.id - Unique user identifier
    * @param {string} [user.displayName] - Optional display name
    * @returns {string} User's display name or "Anonymous"
    */
   ```

2. **Every public function gets JSDoc**
   - Private functions: optional but recommended
   - Simple getters: brief is fine
   - Complex logic: detailed required

3. **Types are critical**
   - Use TypeScript-style JSDoc types
   - Include nullable/optional indicators
   - Use union types for multiple possibilities

4. **Examples for complex functions**
   ```javascript
   /**
    * @example
    * const result = complexFunction(a, b);
    * console.log(result); // Outputs: { success: true }
    */
   ```

---

## JSDoc Template for Each Section

### Module/File Header

```javascript
/**
 * @file src/core/editor/commands.js
 * @description Provides command functions for ProseMirror editor actions
 * @requires prosemirror-commands
 * @requires prosemirror-state
 * @author Your Name
 * @version 1.0.0
 */
```

### Function Documentation

```javascript
/**
 * Brief description of what the function does.
 * 
 * More detailed explanation of purpose, behavior, and important notes.
 * Explain edge cases, side effects, or important behavior.
 * 
 * @param {Type} paramName - Description of parameter
 * @param {Type} [optionalParam=defaultValue] - Optional parameter with default
 * @param {Object} objectParam - Object parameters
 * @param {string} objectParam.property1 - Property description
 * @param {number} objectParam.property2 - Property description
 * @returns {Type} Description of return value
 * @throws {ErrorType} Description of when error is thrown
 * 
 * @example
 * const result = myFunction(arg1, arg2);
 * // Returns: { success: true }
 * 
 * @see {@link relatedFunction}
 * @since 1.0.0
 */
function myFunction(paramName, optionalParam = null, objectParam) {
  // implementation
}
```

### Class Documentation

```javascript
/**
 * Description of the class purpose and responsibilities.
 * 
 * Longer explanation of the class's role in the architecture,
 * important behavior, and usage patterns.
 * 
 * @class
 * @classdesc More formal class description if needed
 * @example
 * const instance = new MyClass(config);
 * instance.method();
 */
class MyClass {
  /**
   * Constructor description
   * @param {Object} config - Configuration object
   * @param {string} config.name - Name of instance
   */
  constructor(config) {}
  
  /**
   * Instance method description
   * @returns {boolean} True if successful
   */
  method() {}
}
```

### Property Documentation

```javascript
class MyClass {
  /**
   * Description of the property
   * @type {string}
   */
  propertyName;
  
  /**
   * Cached user data
   * @type {Map<string, Object>|null}
   * @private
   */
  #cache = null;
}
```

### Callback/Function Type

```javascript
/**
 * Process an item in the collection
 * @callback ItemProcessor
 * @param {Object} item - The item to process
 * @param {number} index - Index in collection
 * @returns {*} Processed item
 */

/**
 * Processes items with a callback
 * @param {ItemProcessor} callback - Function to call for each item
 */
function processItems(callback) {}
```

---

## Type System

### Basic Types

```javascript
// Primitives
@param {string} name
@param {number} count
@param {boolean} isActive
@param {null} empty
@param {undefined} notSet
@param {*} anything

// Objects
@param {Object} config
@param {Object.<string, *>} map  // Object with string keys
@param {Object.<string, number>} numberMap

// Arrays
@param {Array} items
@param {string[]} names
@param {Array.<Object>} objects
@param {(string|number)[]} mixed

// Functions
@param {Function} callback
@param {function(string, number): boolean} predicate

// Unions
@param {string|number} value
@param {(string|null)} optional

// Optional/Nullable
@param {string} [optional] - Optional parameter
@param {?string} nullable - Can be string or null
@param {!string} required - Must be string (not null/undefined)

// Default values
@param {string} [name='Default'] - Optional with default
```

### Custom Types (Project-Specific)

```javascript
/**
 * @typedef {Object} Event
 * @property {number} id - Event ID
 * @property {string} title - Event title
 * @property {Date} dueDate - When event is due
 * @property {number} [priority=5] - Optional priority (1-10)
 */

/**
 * @param {Event} event - An event object
 * @returns {Event} Modified event
 */
function processEvent(event) {}
```

---

## Architecture-Specific Patterns

### ViewModel Pattern

```javascript
/**
 * Manages editor state and persistence
 * 
 * Responsibilities:
 * - Load/save editor content
 * - Manage dirty state
 * - Auto-save with debouncing
 * 
 * @class EditorViewModel
 * @extends {BaseViewModel}
 * @example
 * const vm = new EditorViewModel();
 * await vm.loadContent(eventId);
 * vm.updateContent(markdown);
 */
export class EditorViewModel extends BaseViewModel {
  /**
   * Observable state
   * @type {Object}
   * @property {string} content - Current content
   * @property {boolean} isDirty - Has unsaved changes
   * @property {boolean} isSaving - Currently saving
   */
  observableState = {
    content: '',
    isDirty: false,
    isSaving: false,
  };
}
```

### Web Component Pattern

```javascript
/**
 * Rich text editor Web Component
 * 
 * Uses ProseMirror for WYSIWYG editing with markdown support.
 * Emits 'content-changed' events for ViewModel integration.
 * 
 * @class EditorComponent
 * @extends {HTMLElement}
 * @example
 * <app-editor></app-editor>
 * 
 * document.addEventListener('content-changed', (e) => {
 *   console.log(e.detail.html);
 * });
 */
class EditorComponent extends HTMLElement {
  /**
   * Initialize component
   * @protected
   * @returns {void}
   */
  connectedCallback() {}
}
```

### Command Pattern

```javascript
/**
 * Executes a ProseMirror command
 * 
 * Commands follow the (state, dispatch) signature convention
 * where dispatch is optional - return true if command applies.
 * 
 * @callback Command
 * @param {EditorState} state - Current editor state
 * @param {Function} [dispatch] - Optional dispatch function
 * @returns {boolean} True if command was executed
 */

/**
 * Toggle bold formatting on selection
 * @type {Command}
 * @example
 * toggleBold(state, dispatch);  // Toggles bold on selection
 */
const toggleBold = (state, dispatch) => {
  // implementation
  return true;
};
```

### Model/Database Pattern

```javascript
/**
 * Database model for Events
 * 
 * Handles all database operations for events.
 * Uses Dexie for client-side IndexedDB storage.
 * 
 * @class EventModel
 * @static
 * @example
 * const event = await EventModel.get(123);
 * await EventModel.update(123, { title: 'New Title' });
 */
export class EventModel {
  /**
   * Retrieve an event by ID
   * @static
   * @param {number} eventId - ID of event to retrieve
   * @returns {Promise<?Object>} Event object or null if not found
   * @throws {Error} If database operation fails
   */
  static async get(eventId) {}
}
```

---

## Common Patterns

### Async Functions

```javascript
/**
 * Saves content to database with debouncing
 * @async
 * @param {string} content - Content to save
 * @returns {Promise<Object>} Result with timestamp
 * @throws {DatabaseError} If save fails
 * @see {@link saveLater} for debounced version
 */
async function saveContent(content) {}
```

### Error Handling

```javascript
/**
 * Parse JSON safely
 * @param {string} json - JSON string to parse
 * @returns {Object|null} Parsed object or null if invalid
 * @throws {SyntaxError} If JSON is malformed (when throw=true)
 */
function parseJSON(json) {}
```

### Deprecated Functions

```javascript
/**
 * @deprecated Use {@link newFunction} instead
 * @since 1.0.0
 * @removed 2.0.0
 */
function oldFunction() {}
```

### Internal/Private

```javascript
/**
 * Internal helper - do not use directly
 * @private
 * @internal
 */
function _internalHelper() {}
```

---

## JSDoc Configuration

### File: `.jsdocrc.json`

```json
{
  "sourceType": "module",
  "source": {
    "include": ["src"],
    "includePattern": ".+\\.js$",
    "excludePattern": "(node_modules|dist|tests)"
  },
  "opts": {
    "destination": "./docs/api",
    "recurse": true,
    "readme": "./README.md",
    "template": "./node_modules/better-docs",
    "theme": "dark"
  },
  "plugins": ["plugins/markdown"],
  "markdown": {
    "hardwrap": false,
    "idInHeadings": true
  },
  "templates": {
    "cleverLinks": false,
    "monospaceLinks": false
  }
}
```

### File: `package.json` (add scripts)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "jest",
    "docs": "jsdoc -c .jsdocrc.json",
    "docs:watch": "nodemon --exec 'npm run docs' --watch src",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix"
  },
  "devDependencies": {
    "jsdoc": "^4.0.0",
    "better-docs": "^2.7.2",
    "eslint": "^8.45.0",
    "eslint-plugin-jsdoc": "^46.0.0"
  }
}
```

### File: `.eslintrc.json` (JSDoc validation)

```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": ["eslint:recommended", "plugin:jsdoc/recommended"],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["jsdoc"],
  "rules": {
    "jsdoc/require-description": ["warn"],
    "jsdoc/require-param-description": ["warn"],
    "jsdoc/require-returns-description": ["warn"],
    "jsdoc/require-returns": ["warn"],
    "jsdoc/valid-types": ["error"],
    "jsdoc/no-types": ["off"]
  }
}
```

---

## Real-World Examples

### Example 1: Editor Schema

```javascript
/**
 * @file src/core/editor/schema.js
 * @description Defines ProseMirror schema for markdown-native editing
 * @requires prosemirror-model
 * @requires prosemirror-schema-basic
 * @requires prosemirror-schema-list
 */

import { Schema } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

/**
 * ProseMirror schema with support for:
 * - Headings (h1-h6)
 * - Lists (bullet, ordered)
 * - Code blocks
 * - Blockquotes
 * - All standard marks (em, strong, code, link)
 * 
 * @type {Schema}
 * @constant
 * @example
 * import { schema } from './schema.js';
 * const doc = schema.nodeFromJSON(jsonData);
 */
export const schema = new Schema({
  nodes: addListNodes(baseSchema.spec.nodes, 'block+'),
  marks: baseSchema.spec.marks,
});

export default schema;
```

### Example 2: ViewModel

```javascript
/**
 * @file src/core/viewmodels/EditorViewModel.js
 * @description State management for rich text editor
 * @requires BaseViewModel
 */

import { BaseViewModel } from './BaseViewModel.js';

/**
 * Manages editor content, persistence, and synchronization
 * 
 * Responsibilities:
 * - Load content from database
 * - Track dirty state
 * - Auto-save with debouncing
 * - Handle sync conflicts
 * 
 * @class EditorViewModel
 * @extends {BaseViewModel}
 * @example
 * const viewModel = new EditorViewModel();
 * await viewModel.loadContent(eventId);
 * viewModel.updateContent(markdown, html);
 * await viewModel.forceSave();
 */
export class EditorViewModel extends BaseViewModel {
  /**
   * Observable state shared with UI components
   * @type {Object}
   * @property {string} content - Current markdown content
   * @property {string} html - Rendered HTML representation
   * @property {boolean} isDirty - Has unsaved changes
   * @property {boolean} isSaving - Currently saving to database
   * @property {boolean} isLoading - Currently loading from database
   * @property {?string} error - Last error message if any
   * @property {?Date} lastSavedAt - Timestamp of last successful save
   */
  observableState = {
    content: '',
    html: '',
    isDirty: false,
    isSaving: false,
    isLoading: false,
    error: null,
    lastSavedAt: null,
  };

  /**
   * Current event ID being edited
   * @type {?number}
   * @private
   */
  #currentEventId = null;

  /**
   * Load event content into editor
   * 
   * Retrieves the event from database and populates
   * the editor state. Updates isDirty to false.
   * 
   * @async
   * @param {number} eventId - ID of event to load
   * @returns {Promise<void>}
   * @throws {Error} If event not found or database error
   * @fires EditorViewModel#content-loaded
   * 
   * @example
   * try {
   *   await viewModel.loadContent(123);
   *   console.log(viewModel.state.content);
   * } catch (error) {
   *   console.error('Failed to load:', error);
   * }
   */
  async loadContent(eventId) {
    this.state.isLoading = true;
    this.state.error = null;

    try {
      // Load from database
      const event = await EventModel.get(eventId);
      if (!event) {
        throw new Error(`Event ${eventId} not found`);
      }

      this.#currentEventId = eventId;
      this.state.content = event.description || '';
      this.state.html = event.content_html || '';
      this.state.isDirty = false;

      this.notifyChange({ type: 'CONTENT_LOADED', eventId });
    } catch (error) {
      this.state.error = error.message;
      throw error;
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Update content and mark as dirty
   * 
   * Sets the content state and marks as needing save.
   * Triggers auto-save after 1 second of inactivity.
   * 
   * @param {string} markdown - Markdown content
   * @param {string} html - Rendered HTML
   * @returns {void}
   * 
   * @example
   * viewModel.updateContent('# Title', '<h1>Title</h1>');
   * // Auto-saves after 1s
   */
  updateContent(markdown, html) {
    this.state.content = markdown;
    this.state.html = html;
    this.state.isDirty = true;
    this.state.error = null;

    // Debounced auto-save
    this.#autoSaveDebounced?.();
  }

  /**
   * Save content to database immediately
   * 
   * Persists current content to database and updates
   * lastSavedAt timestamp. Cancels any pending auto-save.
   * 
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If save fails
   * 
   * @example
   * try {
   *   await viewModel.forceSave();
   *   console.log('Saved at', viewModel.state.lastSavedAt);
   * } catch (error) {
   *   console.error('Save failed:', error);
   * }
   */
  async forceSave() {
    if (!this.#currentEventId) return;

    this.state.isSaving = true;
    this.state.error = null;

    try {
      await EventModel.update(this.#currentEventId, {
        description: this.state.content,
        content_html: this.state.html,
        updated_at: new Date().toISOString(),
      });

      this.state.isDirty = false;
      this.state.lastSavedAt = new Date();
    } catch (error) {
      this.state.error = `Save failed: ${error.message}`;
      throw error;
    } finally {
      this.state.isSaving = false;
    }
  }
}

export default EditorViewModel;
```

### Example 3: Web Component

```javascript
/**
 * @file src/ui/components/EditorComponent.js
 * @description Rich text editor Web Component powered by ProseMirror
 * @requires prosemirror-state
 * @requires prosemirror-view
 */

/**
 * Rich text editor Web Component
 * 
 * Provides a WYSIWYG markdown editor with:
 * - Formatting toolbar (bold, italic, links, etc.)
 * - Keyboard shortcuts (Cmd+B, Cmd+I, etc.)
 * - Auto-formatting
 * - Integration with EditorViewModel for persistence
 * 
 * Emits 'content-changed' event when content is modified.
 * 
 * @class EditorComponent
 * @extends {BaseComponent}
 * @example
 * // In HTML
 * <app-editor></app-editor>
 * 
 * // Listen for changes
 * document.addEventListener('content-changed', (event) => {
 *   console.log('Content:', event.detail.html);
 * });
 * 
 * // Programmatic usage
 * const editor = document.querySelector('app-editor');
 * await editor.loadContent(eventId);
 */
export class EditorComponent extends BaseComponent {
  /**
   * ProseMirror editor view instance
   * @type {?EditorView}
   * @private
   */
  #editorView = null;

  /**
   * Component state
   * @type {Object}
   * @property {string} content - Current content
   * @property {boolean} isDirty - Has unsaved changes
   * @property {boolean} isSaving - Currently saving
   */
  state = {
    content: '',
    isDirty: false,
    isSaving: false,
  };

  /**
   * Initialize component when connected to DOM
   * 
   * Creates the ProseMirror editor, attaches toolbar,
   * and connects to ViewModel if available.
   * 
   * @protected
   * @returns {void}
   */
  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.initializeEditor();
    this.bindEvents();
  }

  /**
   * Initialize ProseMirror editor instance
   * 
   * Sets up the editor state with schema, plugins (history,
   * keymap), and dispatch handler for state updates.
   * 
   * @private
   * @returns {void}
   * @throws {Error} If editor container not found
   */
  initializeEditor() {
    try {
      const container = this.shadowRoot.querySelector('.editor-content');
      if (!container) {
        throw new Error('Editor container not found in template');
      }

      const state = EditorState.create({
        schema,
        doc: schema.topNode.create(null, schema.nodes.paragraph.create()),
        plugins: [
          history(),
          keymap(getKeymap()),
        ],
      });

      this.#editorView = new EditorView(container, {
        state,
        dispatchTransaction: (tr) => {
          const newState = this.#editorView.state.apply(tr);
          this.#editorView.updateState(newState);
          this.onEditorUpdate();
        },
      });

      this.#editorView.focus();
    } catch (error) {
      console.error('Failed to initialize editor:', error);
      this.state.error = error.message;
    }
  }

  /**
   * Load content into the editor
   * 
   * Parses content into ProseMirror document and
   * replaces editor content.
   * 
   * @param {string|Object} content - Content as JSON string or object
   * @returns {void}
   * 
   * @example
   * editor.loadContent('{ "type": "doc", ... }');
   * editor.loadContent({ type: 'doc', ... });
   */
  loadContent(content) {
    if (!this.#editorView || !content) return;

    try {
      const doc = schema.nodeFromJSON(
        typeof content === 'string' ? JSON.parse(content) : content
      );

      const tr = this.#editorView.state.tr.replaceWith(
        0,
        this.#editorView.state.doc.content.size,
        doc.content
      );

      this.#editorView.dispatch(tr);
    } catch (error) {
      console.error('Failed to load content:', error);
    }
  }

  /**
   * Cleanup when component is removed from DOM
   * 
   * Destroys the ProseMirror editor view to prevent
   * memory leaks.
   * 
   * @protected
   * @returns {void}
   */
  disconnectedCallback() {
    if (this.#editorView) {
      this.#editorView.destroy();
      this.#editorView = null;
    }
    super.disconnectedCallback();
  }
}
```

---

## Setup Instructions

### Step 1: Install JSDoc

```bash
npm install -D jsdoc better-docs eslint eslint-plugin-jsdoc
```

### Step 2: Create `.jsdocrc.json`

Copy the configuration from above.

### Step 3: Create `.eslintrc.json`

Copy the ESLint configuration from above.

### Step 4: Update `package.json`

Add the scripts from above:
```bash
"docs": "jsdoc -c .jsdocrc.json"
"lint": "eslint src/"
```

### Step 5: Generate Documentation

```bash
npm run docs
# Creates docs/api/ folder with HTML documentation
```

### Step 6: Lint Code

```bash
npm run lint
# Checks JSDoc compliance
```

---

## Best Practices Summary

✅ **DO:**
- Document every public function
- Use precise types
- Explain the WHY, not the obvious
- Include examples for complex functions
- Use `@private` for internal functions
- Use `@async` for async functions
- Link related functions with `@see`
- Update JSDoc when you update code

❌ **DON'T:**
- Write obvious descriptions
- Use vague types like `Object` or `*`
- Skip optional parameter documentation
- Forget to update JSDoc
- Use `any` types
- Document trivial getters
- Mix JSDoc styles

---

## Checklist for Each File

Before committing code:

- [ ] File header with @file, @description, @requires
- [ ] Every public function has @param, @returns
- [ ] Types are specific (not `Object` or `*`)
- [ ] Complex functions have @example
- [ ] Error cases documented with @throws
- [ ] Related functions linked with @see
- [ ] No ESLint JSDoc warnings: `npm run lint`
- [ ] Documentation builds: `npm run docs`

---

## Ready to Continue?

With JSDoc strategy in place, we can now implement Phase 2 (Commands & Keybindings) with proper documentation from the start.

Shall we proceed to the editor implementation? 🚀
