/**
 * @file Contains the BuildingBlockRenderer class, a composable rendering system.
 * @module BuildingBlockRenderer
 * @description This renderer focuses on composing UI from reusable "building blocks" rather than a hierarchical or level-based system.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles on composability.
 */

/**
 * @class BuildingBlockRenderer
 * @classdesc A pure, composable rendering system that builds UI from registered building blocks.
 */
export class BuildingBlockRenderer {
  /**
   * @class
   * @param {object} stateManager - An instance of HybridStateManager or a similar state management class.
   */
  constructor(stateManager) {
    /**
     * @property {object} stateManager - The state manager instance.
     * @public
     */
    this.stateManager = stateManager;
    /**
     * @property {Map<string, object>} blocks - A map of registered building block definitions.
     * @private
     */
    this.blocks = new Map(); // Available building blocks
    /**
     * @property {Map<string, object>} layouts - A map of composable layout definitions.
     * @private
     */
    this.layouts = new Map(); // Composable layouts
    /**
     * @property {Map<string, HTMLElement>} renderCache - A cache for rendered blocks.
     * @private
     */
    this.renderCache = new Map();
  }

  /**
   * @function registerBlock
   * @description Registers a building block definition.
   * @param {string} blockId - The unique identifier for the block.
   * @param {object} blockDefinition - The definition of the block, including its render method and dependencies.
   * @returns {void}
   */
  registerBlock(blockId, blockDefinition) {
    this.blocks.set(blockId, {
      id: blockId,
      render: blockDefinition.render,
      config: blockDefinition.config || {},
      dependencies: blockDefinition.dependencies || [],
      ...blockDefinition,
    });
  }

  /**
   * @function render
   * @description Renders any composition of blocks, including single blocks, sequences, and layouts.
   * @param {string|Array|object} composition - The composition to render.
   * @param {object} [context={}] - The rendering context.
   * @returns {HTMLElement}
   */
  render(composition, context = {}) {
    if (typeof composition === "string") {
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
   * @function renderBlock
   * @description Renders a single building block.
   * @private
   * @param {string} blockId - The ID of the block to render.
   * @param {object} [context={}] - The rendering context.
   * @returns {HTMLElement}
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
        config: { ...block.config, ...context.config },
      };

      if (typeof block.render === "function") {
        return block.render(renderContext);
      } else if (typeof block.render === "string") {
        return this.renderTemplate(block.render, renderContext);
      }

      return this.createErrorElement(`Invalid render method for ${blockId}`);
    } catch (error) {
      console.error(`Error rendering block ${blockId}:`, error);
      return this.createErrorElement(`Render error: ${error.message}`);
    }
  }

  /**
   * @function renderSequence
   * @description Renders a sequence of blocks.
   * @private
   * @param {Array<string|object>} blocks - An array of block configurations.
   * @param {object} [context={}] - The rendering context.
   * @returns {HTMLElement}
   */
  renderSequence(blocks, context = {}) {
    const container = document.createElement("div");
    container.className = "block-sequence";

    blocks.forEach((blockConfig, index) => {
      const blockContext = {
        ...context,
        sequenceIndex: index,
        sequenceLength: blocks.length,
      };

      let element;
      if (typeof blockConfig === "string") {
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
   * @function renderLayout
   * @description Renders a layout composition.
   * @private
   * @param {object} composition - The layout composition object.
   * @param {object} [context={}] - The rendering context.
   * @returns {HTMLElement}
   */
  renderLayout(composition, context = {}) {
    const { layout, blocks = [], config = {} } = composition;

    const container = document.createElement("div");
    container.className = `layout-${layout}`;

    // Apply layout styles
    this.applyLayoutStyles(container, layout, config);

    // Render blocks within layout
    blocks.forEach((blockConfig, index) => {
      const blockElement = this.render(blockConfig, {
        ...context,
        layoutIndex: index,
        layoutType: layout,
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
   * @function renderComposition
   * @description Renders a direct composition object.
   * @private
   * @param {object} composition - The composition object.
   * @param {object} [context={}] - The rendering context.
   * @returns {HTMLElement}
   */
  renderComposition(composition, context = {}) {
    const {
      type = "div",
      className = "",
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
      if (key !== "type" && key !== "children") {
        element[key] = value;
      }
    });

    // Add event listeners
    Object.entries(events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });

    // Render children
    children.forEach((child) => {
      const childElement = this.render(child, context);
      if (childElement) {
        element.appendChild(childElement);
      }
    });

    return element;
  }

  /**
   * @function applyLayoutStyles
   * @description Applies CSS styles for a given layout type.
   * @private
   * @param {HTMLElement} container - The container element for the layout.
   * @param {string} layout - The name of the layout (e.g., 'grid', 'flex').
   * @param {object} config - The configuration for the layout.
   * @returns {void}
   */
  applyLayoutStyles(container, layout, config) {
    const layoutStyles = {
      grid: {
        display: "grid",
        gridTemplateColumns: `repeat(${config.columns || 12}, 1fr)`,
        gap: `${config.gap || 16}px`,
      },
      flex: {
        display: "flex",
        flexDirection: config.direction || "row",
        gap: `${config.gap || 16}px`,
      },
      stack: {
        display: "flex",
        flexDirection: "column",
        gap: `${config.gap || 8}px`,
      },
      absolute: {
        position: "relative",
      },
    };

    const styles = layoutStyles[layout] || {};
    Object.assign(container.style, styles, config.style || {});
  }

  /**
   * @function applyPositioning
   * @description Applies positioning styles to an element within a layout.
   * @private
   * @param {HTMLElement} element - The element to position.
   * @param {object} position - The positioning configuration.
   * @returns {void}
   */
  applyPositioning(element, position) {
    if (position.grid) {
      element.style.gridColumn = `${position.grid.column} / span ${position.grid.width || 1}`;
      element.style.gridRow = `${position.grid.row} / span ${position.grid.height || 1}`;
    }

    if (position.absolute) {
      element.style.position = "absolute";
      if (position.absolute.top !== undefined)
        element.style.top = `${position.absolute.top}px`;
      if (position.absolute.left !== undefined)
        element.style.left = `${position.absolute.left}px`;
      if (position.absolute.right !== undefined)
        element.style.right = `${position.absolute.right}px`;
      if (position.absolute.bottom !== undefined)
        element.style.bottom = `${position.absolute.bottom}px`;
    }

    if (position.flex) {
      element.style.flex = position.flex.grow || "1";
      if (position.flex.order !== undefined)
        element.style.order = position.flex.order;
    }
  }

  /**
   * @function renderTemplate
   * @description Renders a template string with context data.
   * @private
   * @param {string} template - The template string.
   * @param {object} context - The data to inject into the template.
   * @returns {HTMLElement}
   */
  renderTemplate(template, context) {
    let rendered = template;

    // Variable substitution
    rendered = rendered.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? value : "";
    });

    const wrapper = document.createElement("div");
    wrapper.innerHTML = rendered;
    return wrapper.children.length === 1 ? wrapper.firstChild : wrapper;
  }

  /**
   * @function getNestedValue
   * @description Retrieves a nested value from an object using a dot-notation path.
   * @private
   * @param {object} obj - The object to search.
   * @param {string} path - The dot-notation path to the value.
   * @returns {*} The nested value, or undefined if not found.
   */
  getNestedValue(obj, path) {
    return path
      .split(".")
      .reduce(
        (current, key) =>
          current && current[key] !== undefined ? current[key] : undefined,
        obj,
      );
  }

  /**
   * @function createErrorElement
   * @description Creates a standard error element.
   * @private
   * @param {string} message - The error message to display.
   * @returns {HTMLElement}
   */
  createErrorElement(message) {
    const error = document.createElement("div");
    error.className = "render-error";
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
   * @function createModal
   * @description Creates a modal building block.
   * @public
   * @param {Array|object} content - The content of the modal.
   * @param {object} [config={}] - Configuration for the modal.
   * @returns {object} A composition object representing the modal.
   */
  createModal(content, config = {}) {
    const modal = {
      type: "div",
      className: "modal-overlay",
      style: {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "1000",
      },
      events: {
        click: (e) => {
          if (e.target === e.currentTarget && config.onClose) {
            config.onClose();
          }
        },
      },
      children: [
        {
          type: "div",
          className: "modal-content",
          style: {
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            maxWidth: config.maxWidth || "600px",
            maxHeight: config.maxHeight || "80vh",
            overflow: "auto",
            ...config.style,
          },
          children: Array.isArray(content) ? content : [content],
        },
      ],
    };

    return modal;
  }

  /**
   * @function createButton
   * @description Creates a button building block.
   * @public
   * @param {string} text - The text content of the button.
   * @param {object} [config={}] - Configuration for the button.
   * @returns {object} A composition object representing the button.
   */
  createButton(text, config = {}) {
    return {
      type: "button",
      className: `btn ${config.variant || "primary"}`,
      style: {
        padding: "8px 16px",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        backgroundColor: config.variant === "secondary" ? "#6c757d" : "#007bff",
        color: "white",
        ...config.style,
      },
      textContent: text,
      events: {
        click: config.onClick || (() => {}),
      },
    };
  }

  /**
   * @function createInput
   * @description Creates an input building block.
   * @public
   * @param {object} [config={}] - Configuration for the input.
   * @returns {object} A composition object representing the input.
   */
  createInput(config = {}) {
    return {
      type: "input",
      className: "form-input",
      style: {
        padding: "8px 12px",
        border: "1px solid #ddd",
        borderRadius: "4px",
        ...config.style,
      },
      placeholder: config.placeholder || "",
      value: config.value || "",
      events: {
        input: config.onInput || (() => {}),
        change: config.onChange || (() => {}),
      },
    };
  }

  /**
   * @function getAvailableBlocks
   * @description Retrieves a list of all registered block IDs.
   * @public
   * @returns {Array<string>}
   */
  getAvailableBlocks() {
    return Array.from(this.blocks.keys());
  }

  /**
   * @function getBlockDefinition
   * @description Retrieves the definition for a specific block.
   * @public
   * @param {string} blockId - The ID of the block.
   * @returns {object|undefined} The block definition, or undefined if not found.
   */
  getBlockDefinition(blockId) {
    return this.blocks.get(blockId);
  }
}

// Helper functions for creating common compositions

/**
 * @function createModalComposition
 * @description Creates a composition for a modal dialog.
 * @param {Array|object} content - The content to display inside the modal.
 * @param {object} [config={}] - Configuration for the modal.
 * @returns {object} A composition object.
 */
export function createModalComposition(content, config = {}) {
  return {
    layout: "absolute",
    config: { style: { position: "relative" } },
    blocks: [
      {
        type: "div",
        className: "modal-overlay",
        style: {
          position: "fixed",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "1000",
        },
        events: {
          click: (e) => {
            if (e.target === e.currentTarget && config.onClose) {
              config.onClose();
            }
          },
        },
        children: [
          {
            type: "div",
            className: "modal-content",
            style: {
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: config.maxWidth || "600px",
              maxHeight: config.maxHeight || "80vh",
              overflow: "auto",
              ...config.contentStyle,
            },
            children: Array.isArray(content) ? content : [content],
          },
        ],
      },
    ],
  };
}

/**
 * @function createFormComposition
 * @description Creates a composition for a form.
 * @param {Array<object>} fields - An array of field definitions for the form.
 * @param {object} [config={}] - Configuration for the form.
 * @returns {object} A composition object.
 */
export function createFormComposition(fields, config = {}) {
  const formFields = fields.map((field) => ({
    layout: "stack",
    blocks: [
      field.label
        ? {
            type: "label",
            textContent: field.label,
            style: { marginBottom: "4px", fontWeight: "bold" },
          }
        : null,
      {
        type: "input",
        ...field.input,
        style: {
          padding: "8px 12px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          marginBottom: "16px",
          ...field.input?.style,
        },
      },
    ].filter(Boolean),
  }));

  return {
    type: "form",
    className: "composition-form",
    events: {
      submit: config.onSubmit || ((e) => e.preventDefault()),
    },
    children: [
      ...formFields,
      config.showSubmit !== false
        ? {
            type: "button",
            textContent: config.submitText || "Submit",
            style: {
              padding: "12px 24px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            },
          }
        : null,
    ].filter(Boolean),
  };
}

/**
 * @function createCardComposition
 * @description Creates a composition for a card element.
 * @param {Array|object} content - The content of the card.
 * @param {object} [config={}] - Configuration for the card.
 * @returns {object} A composition object.
 */
export function createCardComposition(content, config = {}) {
  return {
    type: "div",
    className: "composition-card",
    style: {
      backgroundColor: "white",
      border: "1px solid #ddd",
      borderRadius: "8px",
      padding: "16px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      ...config.style,
    },
    children: Array.isArray(content) ? content : [content],
  };
}

export default BuildingBlockRenderer;
