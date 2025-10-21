/**
 * @file src/ui/components/MarkdownEditorComponent.js
 * @description Markdown editor Web Component with split-pane preview
 * @dependencies BaseComponent, MarkdownEditorViewModel
 * @pattern Web Component + ViewModel
 */

import MarkdownEditorViewModel from "../../core/viewmodels/markdown-editor.js";

class MarkdownEditorComponent extends window.BaseComponent {
  constructor() {
    super();
    this.editorViewModel = new MarkdownEditorViewModel();
    this.markdown = "";
    this.state = {
      isDirty: false,
      isSaving: false,
      error: null
    };
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    this.render();
    this.bindEvents();
    this.editorViewModel.init();
  }

  bindEvents() {
    if (!this.shadowRoot) return;

    const textarea = this.shadowRoot.querySelector('.editor-input');
    const toolbar = this.shadowRoot.querySelector('.toolbar');

    if (!textarea || !toolbar) {
      console.error("Editor elements not found in shadow DOM");
      return;
    }

    // Real-time preview on input
    textarea.addEventListener('input', (e) => {
      this.markdown = e.target.value;
      this.state.isDirty = true;
      this.updatePreview();
      this.emitChange();
    });

    // Toolbar button clicks
    toolbar.addEventListener('click', (e) => {
      if (e.target.dataset.cmd) {
        this.handleCommand(e.target.dataset.cmd);
        textarea.focus();
      }
    });

    // Keyboard shortcuts
    textarea.addEventListener('keydown', (e) => {
      this.editorViewModel.handleKeydown(e, this);
    });
  }

  handleCommand(cmd) {
    this.editorViewModel.handleCommand(cmd, this);
  }

  updatePreview() {
    if (!this.shadowRoot) return;

    const preview = this.shadowRoot.querySelector('.preview-content');
    if (!preview) return;

    const html = this.editorViewModel.renderMarkdown(this.markdown);
    preview.innerHTML = html;
  }

  /**
   * Wrap selected text with before/after strings
   */
  wrapSelection(before, after) {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    if (!selected) {
      this.insertAtCursor(before + after);
      return;
    }

    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    textarea.value = newText;
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;

    this.markdown = newText;
    this.updatePreview();
    this.emitChange();
  }

  /**
   * Insert text at cursor position
   */
  insertAtCursor(text) {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);

    textarea.value = before + text + after;
    textarea.selectionStart = start + text.length;

    this.markdown = textarea.value;
    this.updatePreview();
    this.emitChange();
  }

  /**
   * Insert heading at start of line
   */
  insertHeading(level) {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    const lastNewline = text.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const lineBeforeCursor = text.substring(lineStart, start);

    if (lineBeforeCursor.trim() === '') {
      const hashes = '#'.repeat(level) + ' ';
      const beforeLine = text.substring(0, lineStart);
      const afterCursor = text.substring(start);

      textarea.value = beforeLine + hashes + afterCursor;
      textarea.selectionStart = lineStart + hashes.length;

      this.markdown = textarea.value;
      this.updatePreview();
      this.emitChange();
    }
  }

  /**
   * Insert list at start of line
   */
  insertList(type) {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    const lastNewline = text.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const lineBeforeCursor = text.substring(lineStart, start);

    if (lineBeforeCursor.trim() === '') {
      const marker = type === 'bullet' ? '- ' : '1. ';
      const beforeLine = text.substring(0, lineStart);
      const afterCursor = text.substring(start);

      textarea.value = beforeLine + marker + afterCursor;
      textarea.selectionStart = lineStart + marker.length;

      this.markdown = textarea.value;
      this.updatePreview();
      this.emitChange();
    }
  }

  /**
   * Insert blockquote at start of line
   */
  insertBlockquote() {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    const lastNewline = text.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const lineBeforeCursor = text.substring(lineStart, start);

    if (lineBeforeCursor.trim() === '') {
      const beforeLine = text.substring(0, lineStart);
      const afterCursor = text.substring(start);

      textarea.value = beforeLine + '> ' + afterCursor;
      textarea.selectionStart = lineStart + 2;

      this.markdown = textarea.value;
      this.updatePreview();
      this.emitChange();
    }
  }

  /**
   * Insert code block at start of line
   */
  insertCodeBlock() {
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    const lastNewline = text.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const lineBeforeCursor = text.substring(lineStart, start);

    if (lineBeforeCursor.trim() === '') {
      const beforeLine = text.substring(0, lineStart);
      const afterCursor = text.substring(start);
      const codeBlock = '```\n\n```\n';

      textarea.value = beforeLine + codeBlock + afterCursor;
      textarea.selectionStart = lineStart + 4; // After ```\n

      this.markdown = textarea.value;
      this.updatePreview();
      this.emitChange();
    }
  }

  /**
   * Get current markdown content
   */
  getContent() {
    return this.markdown;
  }

  /**
   * Set markdown content
   */
  setContent(markdown) {
    this.markdown = markdown;
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (textarea) {
      textarea.value = markdown;
    }
    this.updatePreview();
  }

  /**
   * Clear editor
   */
  clear() {
    this.markdown = "";
    const textarea = this.shadowRoot?.querySelector('.editor-input');
    if (textarea) {
      textarea.value = "";
    }
    this.updatePreview();
    this.state.isDirty = false;
  }

  /**
   * Emit change event for parent components
   */
  emitChange() {
    this.dispatchEvent(
      new CustomEvent('content-changed', {
        detail: {
          markdown: this.markdown,
          isDirty: this.state.isDirty
        },
        bubbles: true,
        composed: true
      })
    );
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;
  }

  getTemplate() {
    return `
      <div class="editor-container">
        <div class="editor-section">
          <div class="toolbar">
            <button data-cmd="h1" title="Heading 1 (⌘+Alt+1)">H1</button>
            <button data-cmd="h2" title="Heading 2 (⌘+Alt+2)">H2</button>
            <button data-cmd="h3" title="Heading 3 (⌘+Alt+3)">H3</button>
            
            <div class="toolbar-divider"></div>
            
            <button data-cmd="bold" title="Bold (⌘+B)"><strong>B</strong></button>
            <button data-cmd="italic" title="Italic (⌘+I)"><em>I</em></button>
            <button data-cmd="code" title="Code (⌘+\`)">{}</button>
            
            <div class="toolbar-divider"></div>
            
            <button data-cmd="bullet" title="Bullet List">• List</button>
            <button data-cmd="ordered" title="Ordered List">1. List</button>
            <button data-cmd="quote" title="Quote">" "</button>
            <button data-cmd="codeblock" title="Code Block">{ { }</button>
          </div>
          
          <textarea class="editor-input" placeholder="Type your note here..."></textarea>
        </div>
        
        <div class="preview-section">
          <div class="preview-content"></div>
        </div>
      </div>
    `;
  }

  getStyles() {
    return `
      * {
        box-sizing: border-box;
      }

      .editor-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        height: 100%;
        padding: 1rem;
        background: white;
      }

      .editor-section,
      .preview-section {
        display: flex;
        flex-direction: column;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
        background: white;
      }

      .toolbar {
        display: flex;
        gap: 0.5rem;
        padding: 0.75rem;
        background: #f8f8f8;
        border-bottom: 1px solid #e0e0e0;
        flex-wrap: wrap;
        align-items: center;
      }

      .toolbar-divider {
        width: 1px;
        height: 24px;
        background: #ddd;
        margin: 0 0.25rem;
      }

      .toolbar button {
        padding: 0.5rem 0.75rem;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        min-width: 36px;
      }

      .toolbar button:hover {
        background: #f0f0f0;
        border-color: #999;
      }

      .toolbar button:active {
        background: #e3f2fd;
        border-color: #1976d2;
      }

      .editor-input {
        flex: 1;
        padding: 1rem;
        border: none;
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.6;
        resize: none;
        outline: none;
        color: #333;
      }

      .editor-input::placeholder {
        color: #999;
      }

      .preview-section {
        background: #fafafa;
      }

      .preview-content {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #333;
      }

      .preview-content h1 {
        font-size: 2em;
        font-weight: 700;
        margin: 1rem 0 0.5rem 0;
        line-height: 1.3;
      }

      .preview-content h2 {
        font-size: 1.5em;
        font-weight: 700;
        margin: 0.75rem 0 0.4rem 0;
        line-height: 1.3;
      }

      .preview-content h3 {
        font-size: 1.17em;
        font-weight: 700;
        margin: 0.5rem 0 0.3rem 0;
        line-height: 1.3;
      }

      .preview-content strong {
        font-weight: 700;
      }

      .preview-content em {
        font-style: italic;
      }

      .preview-content code {
        background: #f5f5f5;
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Monaco', monospace;
        font-size: 0.9em;
        color: #c7254e;
      }

      .preview-content pre {
        background: #2d2d2d;
        color: #f8f8f2;
        padding: 1rem;
        border-radius: 4px;
        overflow-x: auto;
        margin: 1rem 0;
        line-height: 1.4;
      }

      .preview-content pre code {
        background: none;
        padding: 0;
        color: inherit;
      }

      .preview-content blockquote {
        background: #f5f5f5;
        border-left: 3px solid #ccc;
        color: #666;
        margin: 0.5rem 0;
        padding: 0.5rem 1rem;
        border-radius: 2px;
      }

      .preview-content ul,
      .preview-content ol {
        margin: 0.5rem 0;
        padding-left: 2rem;
      }

      .preview-content li {
        margin: 0.25rem 0;
      }

      .preview-content p {
        margin: 0.5rem 0;
      }

      .preview-content br {
        display: block;
        height: 0.5rem;
      }
    `;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define('app-markdown-editor', MarkdownEditorComponent);

export default MarkdownEditorComponent;
