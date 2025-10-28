// core/BuildingBlockRenderer.js
// Pure composable rendering system - no levels, just building blocks

export class BuildingBlockRenderer {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.blocks = new Map(); // Available building blocks
    this.layouts = new Map(); // Composable layouts
    this.renderCache = new Map();
  }

  /**
   * Register a building block
   */
  registerBlock(blockId, blockDefinition) {
    this.blocks.set(blockId, {
      id: blockId,
      render: blockDefinition.render,
      config: blockDefinition.config || {},
      dependencies: blockDefinition.dependencies || [],
      ...blockDefinition
    });
  }

  /**
   * Render any composition of blocks
   */
  render(composition, context = {}) {
    if (typeof composition === 'string') {
      // Single block
      return this.renderBlock(composition, context);
    }

    if (Array.isArray(composition)) {
      // List of blocks
      return this.renderSequence(composition, context);
    }

    if (composition.layout) {
      // Layout with blocks
      return this.renderLayout(composition, context);
    }

    // Direct composition object
    return this.renderComposition(composition, context);
  }

  /**
   * Render a single block
   */
  renderBlock(blockId, context = {}) {
    const block = this.blocks.get(blockId);
    if (!block) {
      return this.createErrorElement(`Block not found: ${blockId}`);
    }

    try {
      const renderContext = {
        ...context,
        blockId,
        config: { ...block.config, ...context.config }
      };

      if (typeof block.render === 'function') {
        return block.render(renderContext);
      } else if (typeof block.render === 'string') {
        return this.renderTemplate(block.render, renderContext);
      }

      return this.createErrorElement(`Invalid render method for ${blockId}`);
    } catch (error) {
      console.error(`Error rendering block ${blockId}:`, error);
      return this.createErrorElement(`Render error: ${error.message}`);
    }
  }

  /**
   * Render a sequence of blocks
   */
  renderSequence(blocks, context = {}) {
    const container = document.createElement('div');
    container.className = 'block-sequence';

    blocks.forEach((blockConfig, index) => {
      const blockContext = {
        ...context,
        sequenceIndex: index,
        sequenceLength: blocks.length
      };

      let element;
      if (typeof blockConfig === 'string') {
        element = this.renderBlock(blockConfig, blockContext);
      } else {
        element = this.render(blockConfig, blockContext);
      }

      if (element) {
        container.appendChild(element);
      }
    });

    return container;
  }

  /**
   * Render a layout composition
   */
  renderLayout(composition, context = {}) {
    const { layout, blocks = [], config = {} } = composition;
    
    const container = document.createElement('div');
    container.className = `layout-${layout}`;

    // Apply layout styles
    this.applyLayoutStyles(container, layout, config);

    // Render blocks within layout
    blocks.forEach((blockConfig, index) => {
      const blockElement = this.render(blockConfig, {
        ...context,
        layoutIndex: index,
        layoutType: layout
      });

      if (blockElement) {
        // Apply positioning if specified
        if (blockConfig.position) {
          this.applyPositioning(blockElement, blockConfig.position);
        }
        container.appendChild(blockElement);
      }
    });

    return container;
  }

  /**
   * Render a direct composition
   */
  renderComposition(composition, context = {}) {
    const {
      type = 'div',
      className = '',
      style = {},
      children = [],
      events = {},
      ...props
    } = composition;

    const element = document.createElement(type);
    
    if (className) element.className = className;
    
    Object.assign(element.style, style);
    
    // Set other properties
    Object.entries(props).forEach(([key, value]) => {
      if (key !== 'type' && key !== 'children') {
        element[key] = value;
      }
    });

    // Add event listeners
    Object.entries(events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });

    // Render children
    children.forEach(child => {
      const childElement = this.render(child, context);
      if (childElement) {
        element.appendChild(childElement);
      }
    });

    return element;
  }

  /**
   * Apply layout styles
   */
  applyLayoutStyles(container, layout, config) {
    const layoutStyles = {
      grid: {
        display: 'grid',
        gridTemplateColumns: `repeat(${config.columns || 12}, 1fr)`,
        gap: `${config.gap || 16}px`
      },
      flex: {
        display: 'flex',
        flexDirection: config.direction || 'row',
        gap: `${config.gap || 16}px`
      },
      stack: {
        display: 'flex',
        flexDirection: 'column',
        gap: `${config.gap || 8}px`
      },
      absolute: {
        position: 'relative'
      }
    };

    const styles = layoutStyles[layout] || {};
    Object.assign(container.style, styles, config.style || {});
  }

  /**
   * Apply positioning to element
   */
  applyPositioning(element, position) {
    if (position.grid) {
      element.style.gridColumn = `${position.grid.column} / span ${position.grid.width || 1}`;
      element.style.gridRow = `${position.grid.row} / span ${position.grid.height || 1}`;
    }

    if (position.absolute) {
      element.style.position = 'absolute';
      if (position.absolute.top !== undefined) element.style.top = `${position.absolute.top}px`;
      if (position.absolute.left !== undefined) element.style.left = `${position.absolute.left}px`;
      if (position.absolute.right !== undefined) element.style.right = `${position.absolute.right}px`;
      if (position.absolute.bottom !== undefined) element.style.bottom = `${position.absolute.bottom}px`;
    }

    if (position.flex) {
      element.style.flex = position.flex.grow || '1';
      if (position.flex.order !== undefined) element.style.order = position.flex.order;
    }
  }

  /**
   * Template rendering
   */
  renderTemplate(template, context) {
    let rendered = template;
    
    // Variable substitution
    rendered = rendered.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? value : '';
    });

    const wrapper = document.createElement('div');
    wrapper.innerHTML = rendered;
    return wrapper.children.length === 1 ? wrapper.firstChild : wrapper;
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  /**
   * Create error element
   */
  createErrorElement(message) {
    const error = document.createElement('div');
    error.className = 'render-error';
    error.style.cssText = `
      padding: 8px;
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 4px;
      color: #c33;
      font-size: 12px;
    `;
    error.textContent = message;
    return error;
  }

  /**
   * Create modal building block
   */
  createModal(content, config = {}) {
    const modal = {
      type: 'div',
      className: 'modal-overlay',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
      },
      events: {
        click: (e) => {
          if (e.target === e.currentTarget && config.onClose) {
            config.onClose();
          }
        }
      },
      children: [{
        type: 'div',
        className: 'modal-content',
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: config.maxWidth || '600px',
          maxHeight: config.maxHeight || '80vh',
          overflow: 'auto',
          ...config.style
        },
        children: Array.isArray(content) ? content : [content]
      }]
    };

    return modal;
  }

  /**
   * Create button building block
   */
  createButton(text, config = {}) {
    return {
      type: 'button',
      className: `btn ${config.variant || 'primary'}`,
      style: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: config.variant === 'secondary' ? '#6c757d' : '#007bff',
        color: 'white',
        ...config.style
      },
      textContent: text,
      events: {
        click: config.onClick || (() => {})
      }
    };
  }

  /**
   * Create input building block
   */
  createInput(config = {}) {
    return {
      type: 'input',
      className: 'form-input',
      style: {
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        ...config.style
      },
      placeholder: config.placeholder || '',
      value: config.value || '',
      events: {
        input: config.onInput || (() => {}),
        change: config.onChange || (() => {})
      }
    };
  }

  /**
   * Get all registered blocks
   */
  getAvailableBlocks() {
    return Array.from(this.blocks.keys());
  }

  /**
   * Get block definition
   */
  getBlockDefinition(blockId) {
    return this.blocks.get(blockId);
  }
}

// Helper functions for creating common compositions

/**
 * Create a configurable modal with any content
 */
export function createModalComposition(content, config = {}) {
  return {
    layout: 'absolute',
    config: { style: { position: 'relative' } },
    blocks: [{
      type: 'div',
      className: 'modal-overlay',
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
      },
      events: {
        click: (e) => {
          if (e.target === e.currentTarget && config.onClose) {
            config.onClose();
          }
        }
      },
      children: [{
        type: 'div',
        className: 'modal-content',
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: config.maxWidth || '600px',
          maxHeight: config.maxHeight || '80vh',
          overflow: 'auto',
          ...config.contentStyle
        },
        children: Array.isArray(content) ? content : [content]
      }]
    }]
  };
}

/**
 * Create a form composition
 */
export function createFormComposition(fields, config = {}) {
  const formFields = fields.map(field => ({
    layout: 'stack',
    blocks: [
      field.label ? {
        type: 'label',
        textContent: field.label,
        style: { marginBottom: '4px', fontWeight: 'bold' }
      } : null,
      {
        type: 'input',
        ...field.input,
        style: {
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          marginBottom: '16px',
          ...field.input?.style
        }
      }
    ].filter(Boolean)
  }));

  return {
    type: 'form',
    className: 'composition-form',
    events: {
      submit: config.onSubmit || ((e) => e.preventDefault())
    },
    children: [
      ...formFields,
      config.showSubmit !== false ? {
        type: 'button',
        textContent: config.submitText || 'Submit',
        style: {
          padding: '12px 24px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }
      } : null
    ].filter(Boolean)
  };
}

/**
 * Create a card composition
 */
export function createCardComposition(content, config = {}) {
  return {
    type: 'div',
    className: 'composition-card',
    style: {
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      ...config.style
    },
    children: Array.isArray(content) ? content : [content]
  };
}

export default BuildingBlockRenderer;
