/**
 * @file src/ui/components/EditorComponent.js
 * @description Rich text editor Web Component with ViewModel integration
 * @dependencies prosemirror-view, EditorViewModel, BaseComponent
 * @pattern Web Component + ViewModel
 */

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { schema } from "../../core/editor/schema.js";
import { getKeymap } from "../../core/editor/keybindings.js";
import * as commands from "../../core/editor/commands.js";
import EditorViewModel from "../../core/viewmodels/editor.js";

if (!window.BaseComponent) {
	throw new Error("BaseComponent must be loaded before EditorComponent");
}

class EditorComponent extends window.BaseComponent {
	constructor() {
		super();
		this.viewModel = new EditorViewModel();
		this.editorView = null;
		this.initialized = false;
	}

	connectedCallback() {
		super.connectedCallback();
		this.render();
		this.initializeEditor();
		this.connectToViewModel();
		this.bindEvents();
	}

	disconnectedCallback() {
		if (this.editorView) {
			this.editorView.destroy();
		}
		if (this.viewModel) {
			this.viewModel.destroy();
		}
		super.disconnectedCallback();
	}

	// Initialize ProseMirror editor
	initializeEditor() {
		try {
			const initialDoc = schema.topNode.create(
				null,
				schema.nodes.paragraph.create()
			);

			const state = EditorState.create({
				schema,
				doc: initialDoc,
				plugins: [
					history(),
					keymap(getKeymap()),
					keymap({
						"Mod-s": (state) => {
							this.viewModel.forceSave().catch((err) => {
								console.error("Force save failed:", err);
							});
							return true;
						},
					}),
				],
			});

			const editorContainer =
				this.shadowRoot.querySelector(".editor-content");

			this.editorView = new EditorView(editorContainer, {
				state,
				dispatch: (tr) => this.handleDispatch(tr),
			});

			this.initialized = true;
			this.emit("editor-ready");
		} catch (error) {
			console.error("Editor initialization failed:", error);
			this.handleError(error, "initialization");
		}
	}

	// Handle editor state changes
	handleDispatch(transaction) {
		try {
			const newState = this.editorView.state.apply(transaction);
			this.editorView.updateState(newState);

			// Get content as HTML and markdown
			const html = this.serializeToHTML(newState.doc);
			const markdown = this.serializeToMarkdown(newState.doc);

			// Update ViewModel
			this.viewModel.updateContent(markdown, html);

			// Emit change event
			this.emit("content-changed", { html, markdown });
		} catch (error) {
			console.error("Dispatch error:", error);
			this.handleError(error, "dispatch");
		}
	}

	// Connect to ViewModel
	connectToViewModel() {
		const unsubscribe = this.viewModel.subscribe((change) => {
			this.onViewModelChange(change);
		});
		this.subscriptions.add(unsubscribe);
	}

	// Handle ViewModel state changes
	onViewModelChange(change) {
		const { type, changes } = change;

		switch (type) {
			case "STATE_UPDATE":
				if (changes.error) {
					this.showError(changes.error);
				}
				if (changes.isSaving !== undefined) {
					this.updateSaveStatus(changes.isSaving);
				}
				break;
			case "AUTO_SAVED":
				this.showStatus("Auto-saved");
				break;
			case "FORCE_SAVED":
				this.showStatus("Saved");
				break;
		}
	}

	// Toolbar button handlers
	bindEvents() {
		const buttons = this.shadowRoot.querySelectorAll("[data-command]");

		buttons.forEach((button) => {
			button.removeEventListener("click", this.handleButtonClick);
			button.addEventListener("click", (e) => this.handleButtonClick(e));
		});
	}

	handleButtonClick(e) {
		const command = e.currentTarget.dataset.command;

		try {
			const state = this.editorView.state;
			let cmd = null;

			switch (command) {
				case "bold":
					cmd = commands.toggleFormat("strong");
					break;
				case "italic":
					cmd = commands.toggleFormat("em");
					break;
				case "code":
					cmd = commands.toggleFormat("code");
					break;
				case "link":
					cmd = commands.addLink("https://example.com");
					break;
				case "h1":
					cmd = commands.insertHeading(1);
					break;
				case "h2":
					cmd = commands.insertHeading(2);
					break;
				case "h3":
					cmd = commands.insertHeading(3);
					break;
				case "bullet":
					cmd = commands.insertBulletList();
					break;
				case "ordered":
					cmd = commands.insertOrderedList();
					break;
				case "blockquote":
					cmd = commands.insertBlockquote();
					break;
				case "code-block":
					cmd = commands.insertCodeBlock();
					break;
			}

			if (cmd && cmd(state, (tr) => this.handleDispatch(tr))) {
				this.editorView.focus();
			}
		} catch (error) {
			console.error("Command execution failed:", error);
			this.handleError(error, "command");
		}
	}

	// Load event content
	async loadEvent(eventId) {
		try {
			await this.viewModel.loadEvent(eventId);

			// Update editor with loaded content
			const content = this.viewModel.getState().markdown;
			this.setEditorContent(content);
		} catch (error) {
			this.handleError(error, "load");
		}
	}

	// Set editor content
	setEditorContent(content) {
		try {
			const doc = schema.topNode.create(
				null,
				schema.nodes.paragraph.create(null, schema.text(content))
			);

			const state = EditorState.create({ schema, doc });
			this.editorView.updateState(state);
		} catch (error) {
			console.error("Set content failed:", error);
		}
	}

	// Serialization helpers
	serializeToHTML(doc) {
		// Simple HTML serialization - extend as needed
		let html = "";
		doc.forEach((node) => {
			html += this.nodeToHTML(node);
		});
		return html;
	}

	serializeToMarkdown(doc) {
		// Simple markdown serialization - extend as needed
		let markdown = "";
		doc.forEach((node) => {
			markdown += this.nodeToMarkdown(node);
		});
		return markdown;
	}

	nodeToHTML(node) {
		// Basic implementation - extend for more node types
		if (node.type.name === "paragraph") {
			return `<p>${node.textContent}</p>`;
		}
		if (node.type.name === "heading") {
			const level = node.attrs.level;
			return `<h${level}>${node.textContent}</h${level}>`;
		}
		return node.textContent;
	}

	nodeToMarkdown(node) {
		// Basic implementation - extend for more node types
		if (node.type.name === "paragraph") {
			return `${node.textContent}\n\n`;
		}
		if (node.type.name === "heading") {
			const level = node.attrs.level;
			return `${"#".repeat(level)} ${node.textContent}\n\n`;
		}
		return node.textContent;
	}

	// UI feedback
	showStatus(message) {
		const status = this.shadowRoot.querySelector(".editor-status");
		if (status) {
			status.textContent = message;
			setTimeout(() => {
				status.textContent = "";
			}, 2000);
		}
	}

	showError(message) {
		const status = this.shadowRoot.querySelector(".editor-status");
		if (status) {
			status.textContent = `❌ ${message}`;
			status.style.color = "#d32f2f";
		}
	}

	updateSaveStatus(isSaving) {
		const status = this.shadowRoot.querySelector(".editor-status");
		if (status) {
			status.textContent = isSaving ? "💾 Saving..." : "";
		}
	}

	handleError(error, context) {
		console.error(`Editor error (${context}):`, error);
		this.showError(`Error: ${error.message}`);
		this.emit("editor-error", { error, context });
	}

	// Rendering
	render() {
		this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;
	}

	getTemplate() {
		return `
      <div class="editor-wrapper">
        <div class="editor-toolbar">
          <button data-command="bold" class="btn" title="Bold (Cmd+B)">
            <strong>B</strong>
          </button>
          <button data-command="italic" class="btn" title="Italic (Cmd+I)">
            <em>I</em>
          </button>
          <button data-command="code" class="btn" title="Code (Cmd+\`)">
            <code>&lt;/&gt;</code>
          </button>
          <button data-command="link" class="btn" title="Link (Cmd+K)">
            🔗
          </button>
          
          <div class="separator"></div>
          
          <button data-command="h1" class="btn" title="Heading 1">H1</button>
          <button data-command="h2" class="btn" title="Heading 2">H2</button>
          <button data-command="h3" class="btn" title="Heading 3">H3</button>
          <button data-command="bullet" class="btn" title="Bullet List">≡</button>
          <button data-command="ordered" class="btn" title="Ordered List">1.</button>
          <button data-command="blockquote" class="btn" title="Quote">"</button>
          <button data-command="code-block" class="btn" title="Code Block">{"{"}</button>
        </div>
        
        <div class="editor-content"></div>
        <div class="editor-status"></div>
      </div>
    `;
	}

	getStyles() {
		return `
      :host {
        display: block;
        font-family: system-ui, -apple-system, sans-serif;
      }

      .editor-wrapper {
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
      }

      .editor-toolbar {
        display: flex;
        gap: 4px;
        padding: 8px;
        background: #f9f9f9;
        border-bottom: 1px solid #eee;
        flex-wrap: wrap;
      }

      .btn {
        padding: 6px 10px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        border-radius: 3px;
        font-size: 13px;
        transition: all 0.2s;
      }

      .btn:hover {
        background: #f0f0f0;
        border-color: #999;
      }

      .btn:active {
        background: #e0e0e0;
      }

      .separator {
        width: 1px;
        background: #ddd;
        margin: 0 4px;
      }

      .editor-content {
        padding: 12px;
        min-height: 200px;
        font-size: 14px;
        line-height: 1.6;
      }

      .ProseMirror {
        outline: none;
      }

      .ProseMirror p {
        margin: 0.5em 0;
      }

      .ProseMirror h1, .ProseMirror h2, .ProseMirror h3,
      .ProseMirror h4, .ProseMirror h5, .ProseMirror h6 {
        margin: 0.75em 0 0.5em 0;
        font-weight: 600;
      }

      .ProseMirror h1 { font-size: 1.8em; }
      .ProseMirror h2 { font-size: 1.5em; }
      .ProseMirror h3 { font-size: 1.2em; }

      .ProseMirror strong { font-weight: 600; }
      .ProseMirror em { font-style: italic; }
      .ProseMirror code { background: #f5f5f5; padding: 2px 4px; border-radius: 2px; }
      .ProseMirror pre { background: #f5f5f5; padding: 12px; border-radius: 4px; }

      .editor-status {
        padding: 8px 12px;
        font-size: 12px;
        color: #666;
        border-top: 1px solid #f0f0f0;
        background: #fafafa;
        min-height: 20px;
      }
    `;
	}
}

customElements.define("app-editor", EditorComponent);
export default EditorComponent;
