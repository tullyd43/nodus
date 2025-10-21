/**
 * @file src/core/viewmodels/markdown-editor.js
 * @description ViewModel for markdown editor functionality
 * @pattern MVVM - handles editor logic and markdown rendering
 */

class MarkdownEditorViewModel {
  constructor() {
    this.state = {
      markdown: "",
      isDirty: false,
      error: null
    };
  }

  /**
   * Initialize ViewModel
   */
  init() {
    console.log("MarkdownEditorViewModel initialized");
  }

  /**
   * Handle keyboard shortcuts
   * @param {KeyboardEvent} e - The keyboard event
   * @param {Object} component - Reference to the editor component
   */
  handleKeydown(e, component) {
    // Cmd/Ctrl + B for bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      component.wrapSelection('**', '**');
      return;
    }

    // Cmd/Ctrl + I for italic
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      component.wrapSelection('*', '*');
      return;
    }

    // Cmd/Ctrl + ` for code
    if ((e.metaKey || e.ctrlKey) && e.key === '`') {
      e.preventDefault();
      component.wrapSelection('`', '`');
      return;
    }

    // Cmd/Ctrl + Alt + 1 for H1
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '1') {
      e.preventDefault();
      component.insertHeading(1);
      return;
    }

    // Cmd/Ctrl + Alt + 2 for H2
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '2') {
      e.preventDefault();
      component.insertHeading(2);
      return;
    }

    // Cmd/Ctrl + Alt + 3 for H3
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '3') {
      e.preventDefault();
      component.insertHeading(3);
      return;
    }

    // Tab for indentation (4 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      component.insertAtCursor('    ');
      return;
    }
  }

  /**
   * Handle toolbar button commands
   * @param {string} cmd - The command to handle
   * @param {Object} component - Reference to the editor component
   */
  handleCommand(cmd, component) {
    switch (cmd) {
      case 'h1':
        component.insertHeading(1);
        break;
      case 'h2':
        component.insertHeading(2);
        break;
      case 'h3':
        component.insertHeading(3);
        break;
      case 'bold':
        component.wrapSelection('**', '**');
        break;
      case 'italic':
        component.wrapSelection('*', '*');
        break;
      case 'code':
        component.wrapSelection('`', '`');
        break;
      case 'bullet':
        component.insertList('bullet');
        break;
      case 'ordered':
        component.insertList('ordered');
        break;
      case 'quote':
        component.insertBlockquote();
        break;
      case 'codeblock':
        component.insertCodeBlock();
        break;
      default:
        console.warn(`Unknown command: ${cmd}`);
    }
  }

  /**
   * Convert markdown to HTML for preview
   * @param {string} markdown - The markdown text to render
   * @returns {string} HTML string
   */
  renderMarkdown(markdown) {
    let html = markdown;

    // Escape HTML special characters
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks (must be before inline code)
    html = html.replace(
      /```([\s\S]*?)```/g,
      '<pre><code>$1</code></pre>'
    );

    // Headings (order matters: h3, h2, h1)
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Bold (must be before italic)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Blockquotes
    html = html.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>)/s, '<ol>$1</ol>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  /**
   * Parse markdown and extract metadata
   * @param {string} markdown - The markdown text to parse
   * @returns {Object} Parsed metadata
   */
  parseMarkdown(markdown) {
    return {
      headings: this.extractHeadings(markdown),
      codeBlocks: this.extractCodeBlocks(markdown),
      links: this.extractLinks(markdown),
      raw: markdown
    };
  }

  /**
   * Extract headings from markdown
   * @private
   */
  extractHeadings(markdown) {
    const regex = /^(#{1,3}) (.*?)$/gm;
    const headings = [];
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2],
        position: match.index
      });
    }

    return headings;
  }

  /**
   * Extract code blocks from markdown
   * @private
   */
  extractCodeBlocks(markdown) {
    const regex = /```([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        code: match[1].trim(),
        position: match.index
      });
    }

    return blocks;
  }

  /**
   * Extract links from markdown
   * @private
   */
  extractLinks(markdown) {
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links = [];
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        position: match.index
      });
    }

    return links;
  }
}

export default MarkdownEditorViewModel;
