/**
 * @file src/ui/components/EditorComponent.js
 * @description Rich text editor Web Component with ViewModel integration
 * @dependencies prosemirror-view, EditorViewModel, BaseComponent, prosemirror-markdown
 * @pattern Web Component + ViewModel
 */

import "prosemirror-view/style/prosemirror.css";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { DOMSerializer } from "prosemirror-model";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
	defaultMarkdownSerializer,
	defaultMarkdownParser,
} from "prosemirror-markdown";
import { schema } from "../../core/editor/schema.js";
import { getKeymap } from "../../core/editor/keybindings.js";
import * as commands from "../../core/editor/commands.js";
import createInputRules from "../../core/editor/inputrules.js";
import EditorViewModel from "../../core/viewmodels/editor.js";

// Ensure BaseComponent is available
if (!window.BaseComponent) {
	throw new Error("BaseComponent must be loaded before EditorComponent");
}

class EditorComponent extends window.BaseComponent {
	constructor() {
		super();
		this.editorView = null;
		this.state = {
			content: "",
			markdown: "",
			isDirty: false,
			isSaving: false,
			error: null,
		};
	}

	connectedCallback() {
		// Don't call super.connectedCallback() - we handle our own initialization
		// Ensure shadow DOM is ready
		if (!this.shadowRoot) {
			this.attachShadow({ mode: "open" });
		}

		this.render();
		this.initializeEditor();
		this.connectToViewModel();
		this.bindEvents();
	}

	/**
	 * Initialize ProseMirror editor
	 */
	initializeEditor() {
		try {
			// Parse initial content - create empty doc
			const initialDoc = schema.nodes.doc.create(
				null,
				schema.nodes.paragraph.create()
			);

			// Create editor state
			const state = EditorState.create({
				schema,
				doc: initialDoc,
				plugins: [
					history(),
					keymap(getKeymap()),
					createInputRules(),
					// Custom plugin to preserve newlines in code blocks
					new Plugin({
						props: {
							handleDOMEvents: {
								beforeinput: (view, event) => {
									if (
										event.inputType === "insertText" ||
										event.inputType ===
											"insertCompositionText"
									) {
										const { $from } = view.state.selection;

										// Check if we're in a code_block
										for (let d = $from.depth; d > 0; d--) {
											if (
												$from.node(d).type.name ===
												"code_block"
											) {
												// In code block - let it process normally
												// but we'll handle the text carefully
												return false;
											}
										}
									}
									return false;
								},
							},
						},
					}),
				],
			});

			// Get or create editor container
			const editorContainer =
				this.shadowRoot.querySelector(".editor-content");
			if (!editorContainer) {
				throw new Error("Editor container not found in template");
			}

			// Create editor view
			this.editorView = new EditorView(editorContainer, {
				state,
				dispatchTransaction: (tr) => {
					console.log("=== TRANSACTION ===");
					console.log("Step type:", tr.getMeta("uiEvent"));

					// Check code_block content before apply
					state.doc.descendants((node) => {
						if (node.type.name === "code_block") {
							console.log(
								"Code block BEFORE:",
								JSON.stringify(node.textContent)
							);
						}
					});

					const newState = this.editorView.state.apply(tr);

					// Check code_block content after apply
					newState.doc.descendants((node) => {
						if (node.type.name === "code_block") {
							console.log(
								"Code block AFTER:",
								JSON.stringify(node.textContent)
							);
						}
					});

					this.editorView.updateState(newState);

					// Notify of changes
					this.onEditorUpdate();
				},
			});

			// Focus editor on load
			this.editorView.focus();
			console.log("Editor initialized successfully");
		} catch (error) {
			console.error("Failed to initialize editor:", error);
			this.state.error = error.message;
		}
	}

	/**
	 * Handle editor content changes
	 */
	onEditorUpdate() {
		if (!this.editorView) return;

		this.state.isDirty = true;

		// Emit change event for ViewModel
		this.dispatchEvent(
			new CustomEvent("content-changed", {
				detail: {
					doc: this.editorView.state.doc.toJSON(),
				},
				bubbles: true,
				composed: true,
			})
		);
	}

	/**
	 * Connect to ViewModel for external updates
	 */
	connectToViewModel() {
		if (window.app?.editorViewModel) {
			this.connectToViewModel(window.app.editorViewModel);
		}
	}

	/**
	 * Handle ViewModel updates
	 */
	onViewModelChange(change) {
		if (!change || !this.editorView) return;

		switch (change.type) {
			case "CONTENT_LOADED":
				this.loadContent(change.content);
				break;
			case "CONTENT_SYNCED":
				this.loadContent(change.content);
				break;
		}
	}

	/**
	 * Load content into editor
	 */
	loadContent(content) {
		if (!this.editorView || !content) return;

		console.log(
			"⚠️ loadContent called with:",
			typeof content,
			content?.length ? `${content.length} chars` : content
		);

		try {
			const doc = schema.nodeFromJSON(
				typeof content === "string" ? JSON.parse(content) : content
			);

			const tr = this.editorView.state.tr.replaceWith(
				0,
				this.editorView.state.doc.content.size,
				doc.content
			);

			this.editorView.dispatch(tr);
		} catch (error) {
			console.error("Failed to load content:", error);
			this.state.error = error.message;
		}
	}

	/**
	 * Bind toolbar button events
	 */
	bindEvents() {
		if (!this.shadowRoot) return;

		const buttons = {
			bold: () => {
				if (!this.editorView) return;
				commands.toggleFormat("strong")(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			italic: () => {
				if (!this.editorView) return;
				commands.toggleFormat("em")(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			code: () => {
				if (!this.editorView) return;
				commands.toggleFormat("code")(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			link: () => this.showLinkDialog(),
			h1: () => {
				if (!this.editorView) return;
				commands.insertHeading(1)(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			h2: () => {
				if (!this.editorView) return;
				commands.insertHeading(2)(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			bullet: () => {
				if (!this.editorView) return;
				commands.insertBulletList()(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			ordered: () => {
				if (!this.editorView) return;
				commands.insertOrderedList()(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			quote: () => {
				if (!this.editorView) return;
				commands.insertBlockquote()(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
			"code-block": () => {
				if (!this.editorView) return;
				commands.insertCodeBlock()(
					this.editorView.state,
					this.editorView.dispatch
				);
			},
		};

		// Attach click handlers for toolbar buttons
		this.shadowRoot.querySelectorAll("[data-command]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const command = btn.dataset.command;
				const handler = buttons[command];
				if (handler) {
					handler();
					if (this.editorView) {
						this.editorView.focus();
					}
				}
			});
		});

		// FIX 4: Make editor clickable and focusable anywhere
		const editorContent = this.shadowRoot.querySelector(".editor-content");
		if (editorContent) {
			editorContent.addEventListener("click", () => {
				if (this.editorView) {
					this.editorView.focus();
				}
			});
		}
	}

	/**
	 * Show dialog to get link URL
	 */
	showLinkDialog() {
		if (!this.editorView) return;

		const { $from, $to } = this.editorView.state.selection;

		// Check if there's selected text
		if ($from.pos === $to.pos) {
			alert("Please select text first");
			return;
		}

		const url = prompt("Enter URL:");
		if (!url) return;

		commands.addLink(url)(this.editorView.state, this.editorView.dispatch);
	}

	/**
	 * Web Component lifecycle - render template
	 */
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
          <button data-command="code" class="btn" title="Inline Code (Cmd+\`)">
            <code>&lt;/&gt;</code>
          </button>
          <button data-command="link" class="btn" title="Link (Cmd+K)">
            🔗
          </button>
          
          <div class="separator"></div>
          
          <button data-command="h1" class="btn" title="Heading 1">H1</button>
          <button data-command="h2" class="btn" title="Heading 2">H2</button>
          <button data-command="bullet" class="btn" title="Bullet List">
            ≡
          </button>
          <button data-command="ordered" class="btn" title="Ordered List">
            1.
          </button>
          <button data-command="quote" class="btn" title="Quote">
            "
          </button>
          <button data-command="code-block" class="btn" title="Code Block">
            [ ]
          </button>
        </div>
        
        <div class="editor-content"></div>
        
        <div class="editor-status">
          Markdown supported • Ctrl+B bold, Ctrl+I italic
        </div>
      </div>
    `;
	}

	getStyles() {
		return `
      * {
        box-sizing: border-box;
      }

      .editor-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        background: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .editor-toolbar {
        display: flex;
        gap: 4px;
        padding: 8px;
        border-bottom: 1px solid #f0f0f0;
        background: #fafafa;
        flex-wrap: wrap;
      }

      .editor-toolbar .btn {
        padding: 4px 8px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        border-radius: 2px;
        font-size: 13px;
        min-width: 28px;
        transition: all 0.2s;
      }

      .editor-toolbar .btn:hover {
        background: #f0f0f0;
        border-color: #999;
      }

      .editor-toolbar .btn:active {
        background: #e3f2fd;
        border-color: #1976d2;
      }

      .separator {
        width: 1px;
        background: #ddd;
        margin: 0 4px;
      }

      /* FIX 4: Editor height and clickability */
      .editor-content {
        flex: 1;
        overflow: auto;
        padding: 16px;
        line-height: 1.6;
        min-height: 300px;
        cursor: text;
        white-space: pre-wrap;
      }

      /* ProseMirror content styles */
      .ProseMirror {
        outline: none;
        min-height: 100%;
        white-space: pre-wrap;
      }

      .ProseMirror p {
        margin: 0.5em 0;
      }

      .ProseMirror h1 {
        font-size: 2em;
        font-weight: bold;
        margin: 0.67em 0 0.33em 0;
      }

      .ProseMirror h2 {
        font-size: 1.5em;
        font-weight: bold;
        margin: 0.75em 0 0.38em 0;
      }

      .ProseMirror h3 {
        font-size: 1.17em;
        font-weight: bold;
        margin: 0.83em 0 0.42em 0;
      }

      .ProseMirror strong {
        font-weight: bold;
      }

      .ProseMirror em {
        font-style: italic;
      }

      .ProseMirror code {
        background: #f5f5f5;
        padding: 2px 4px;
        border-radius: 2px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }

      /* Code block styling - clean, no line numbers */
      .ProseMirror pre {
        background: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 12px;
        overflow-x: auto;
        margin: 0.5em 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        position: relative;
      }

      .ProseMirror pre code {
        background: none;
        padding: 0;
        border-radius: 0;
        display: block;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }

      /* Code block backticks visibility */
      .ProseMirror pre.code-block-focused {
        /* Backticks are visible when focused */
      }

      /* Hide backticks when code block is not focused */
      .backtick-hidden {
        display: none;
      }

      /* When focused, make sure backticks are visible */
      .ProseMirror pre.code-block-focused .backtick-hidden {
        display: inline;
      }

      .ProseMirror blockquote {
        border-left: 3px solid #ccc;
        color: #666;
        margin: 0.5em 0;
        padding-left: 12px;
      }

      .ProseMirror ul, 
      .ProseMirror ol {
        padding-left: 2em;
        margin: 0.5em 0;
      }

      .ProseMirror li {
        margin: 0.25em 0;
      }

      .ProseMirror a {
        color: #1976d2;
        text-decoration: underline;
        cursor: pointer;
      }

      .ProseMirror hr {
        border: none;
        border-top: 1px solid #ddd;
        margin: 1em 0;
      }

      .editor-status {
        padding: 8px;
        font-size: 11px;
        color: #999;
        border-top: 1px solid #f0f0f0;
        background: #fafafa;
      }
    `;
	}

	disconnectedCallback() {
		if (this.editorView) {
			this.editorView.destroy();
		}
		super.disconnectedCallback();
	}
}

// Register the Web Component
customElements.define("app-editor", EditorComponent);

export default EditorComponent;
