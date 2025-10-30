/**
 * @file GridEnhancementIntegration.js
 * @description This module demonstrates how to integrate the `EnhancedGridRenderer` into an existing application's grid system.
 * It showcases the composability principle by layering modern grid capabilities onto an existing `MainView` structure
 * without requiring a complete rewrite.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

import EnhancedGridRenderer from "./EnhancedGridRenderer.js";


/**
 * @class MainViewWithEnhancedGrid
 * @classdesc An example class demonstrating how to enhance an existing `MainView` (or similar component)
 * with modern grid capabilities provided by `EnhancedGridRenderer`. It integrates accessibility,
 * performance monitoring, and layout persistence.
 */
export class MainViewWithEnhancedGrid {
  /**
   * Creates an instance of MainViewWithEnhancedGrid.
   * @param {object} appViewModel - The main application view model, expected to have `gridLayoutViewModel` and `hybridStateManager`.
   */
  constructor(appViewModel) {
    this.appViewModel = appViewModel;
    this.elements = {
      gridContainer: document.querySelector(".grid-container"),
    };
    this.unsubscribeFunctions = [];
    /**
     * The instance of the EnhancedGridRenderer.
     * @type {EnhancedGridRenderer|null}
     * @private
     */
    this.gridEnhancer = null;
    /**
     * An array to store functions that unsubscribe from event listeners, for cleanup.
     * @type {Function[]}
     * @private
     */
    this.unsubscribeFunctions = []; // Duplicate, keeping the first one.

    // Your existing MainView initialization code would go here
    this.initializeExistingGrid();

    // Then enhance with modern capabilities
    this.enhanceGrid();
  }

  /**
   * Safely emits an event through the global `eventFlowEngine` if it is available.
   * @private
   * @param {string} eventName - The name of the event to emit.
   * @param {object} detail - The data payload for the event.
   */
  safeEmit(eventName, detail) {
    if (typeof window.eventFlowEngine !== 'undefined') {
      window.eventFlowEngine.emit(eventName, detail);
    }
  }

  initializeExistingGrid() {
    /**
     * Initializes the existing grid system, including its rendering and event listeners.
     * This method represents the original initialization logic of the `MainView`.
     */
    // This represents your existing grid initialization
    // from main-view.js - keeping it intact
    console.log("Initializing existing grid system...");

    // Your existing event listeners
    if (window.eventFlowEngine) {
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("gridChange", this.renderGrid.bind(this)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("error", this.handleError.bind(this)));
    }
  }

  enhanceGrid() {
        /**
     * Enhances the existing grid with modern capabilities by instantiating `EnhancedGridRenderer`
     * and setting up event listeners for enhanced grid events.
     */
    // Then enhance with modern capabilities
    this.gridEnhancer = new EnhancedGridRenderer(
      {
        container: this.elements.gridContainer,
        appViewModel: this.appViewModel,
        options: {
          // Hook into HybridStateManager for instant layout persistence
          onLayoutChange: (changeEvent) => {
            console.log("Layout changed:", changeEvent);

            // Save to HybridStateManager if available
            if (this.appViewModel.hybridStateManager) {
              this.appViewModel.hybridStateManager.recordOperation({
                type: "grid_layout_change",
                data: changeEvent,
              });
            }

            // Optional: Send to analytics
            this.trackLayoutChange(changeEvent);
          },

          // Enable accessibility features
          enableKeyboard: true,
          enableAria: true,
        }
      },
      this.appViewModel.hybridStateManager
    );

    // Listen for enhancement events
    if (window.eventFlowEngine) {
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("gridEnhanced", this.onGridEnhanced.bind(this)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("blockDragEnd", this.onBlockMoved.bind(this)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("layoutChanged", this.onLayoutPersisted.bind(this)));
    }

    console.log("Grid enhanced with modern capabilities");
  }

  /**
   * Renders the grid based on provided `gridBlocks` data.
   * This method represents the original grid rendering logic of the `MainView`.
   * @param {Array<object>} gridBlocks - An array of block data objects to render.
   */
  // Your existing renderGrid method - unchanged
  renderGrid(gridBlocks) {
    const container = this.elements.gridContainer;
    container.innerHTML = "";

    gridBlocks.forEach((block) => {
      const div = document.createElement("div");
      div.classList.add("grid-block");
      div.dataset.blockId = block.blockId;

      // Your existing block rendering logic
      div.style.gridColumnStart = block.position.x + 1;
      div.style.gridColumnEnd = block.position.x + block.position.w + 1;
      div.style.gridRowStart = block.position.y + 1;
      div.style.gridRowEnd = block.position.y + block.position.h + 1;

      // Your existing content rendering
      const contentEl = document.createElement("div");
      contentEl.classList.add("block-content");

      try {
        const widget = this.renderWidget(block);
        contentEl.appendChild(widget);
      } catch (err) {
        console.error("Widget render error:", err);
        this.safeEmit("error", err);
      }

      div.appendChild(contentEl);

      // Your existing resize handle
      const handle = document.createElement("div");
      handle.classList.add("resize-handle");
      div.appendChild(handle);

      container.appendChild(div);

      // Your existing drag/resize handlers
      this.attachDragHandlers(div, block);
      this.attachResizeHandlers(div, handle, block);
    });

    this.safeEmit("gridRendered", gridBlocks);
  }

  // Your existing methods - enhanced automatically
  /**
   * Attaches drag handlers to a grid block. The `EnhancedGridRenderer` will layer its own
   * enhanced drag capabilities on top of these existing handlers.
   * @param {HTMLElement} div - The DOM element of the grid block.
   * @param {object} block - The data object for the block.
   */
  attachDragHandlers(div, block) {
    // Your existing drag logic - the enhancer will layer on top
    let startX, startY, origX, origY;

    const onMouseDown = (e) => {
      if (e.target.classList.contains("resize-handle")) return;

      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origX = block.position.x;
      origY = block.position.y;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const gridWidth = this.elements.gridContainer.clientWidth;
      const unitWidth = gridWidth / 24;
      const newX = Math.max(0, Math.round(origX + deltaX / unitWidth));
      const newY = Math.max(0, Math.round(origY + deltaY / unitWidth));

      block.position.x = newX;
      block.position.y = newY;
      div.style.gridColumnStart = newX + 1;
      div.style.gridRowStart = newY + 1;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      this.appViewModel.gridLayoutViewModel.updatePositions([
        { blockId: block.blockId, ...block.position },
      ]);
    };

    div.addEventListener("mousedown", onMouseDown);
  }

  /**
   * Attaches resize handlers to a grid block's resize handle. The `EnhancedGridRenderer` will layer its own
   * enhanced resize capabilities on top of these existing handlers.
   * @param {HTMLElement} div - The DOM element of the grid block.
   * @param {HTMLElement} handle - The resize handle element.
   * @param {object} block - The data object for the block.
   */
  attachResizeHandlers(div, handle, block) {
    // Your existing resize logic - enhanced automatically
    let startX, startY, origW, origH;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origW = block.position.w;
      origH = block.position.h;

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const gridWidth = this.elements.gridContainer.clientWidth;
      const unitWidth = gridWidth / 24;
      const newW = Math.max(1, Math.round(origW + deltaX / unitWidth));
      const newH = Math.max(1, Math.round(origH + deltaY / unitWidth));

      block.position.w = newW;
      block.position.h = newH;
      div.style.gridColumnEnd = block.position.x + 1 + newW;
      div.style.gridRowEnd = block.position.y + 1 + newH;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      this.appViewModel.gridLayoutViewModel.updatePositions([
        { blockId: block.blockId, ...block.position },
      ]);
    };

    handle.addEventListener("mousedown", onMouseDown);
  }

  /**
   * Renders a widget within a grid block.
   * @param {object} block - The block data containing widget information.
   * @returns {HTMLElement} The rendered widget element.
   */
  renderWidget(block) {
    // Your existing widget rendering logic
    const widget = document.createElement("div");
    widget.textContent = `Widget: ${block.component}`;
    return widget;
  }

  // Enhancement event handlers
  /**
   * Handles the `gridEnhanced` event, indicating that the grid enhancements are active.
   * @param {object} data - The event data, including the renderer instance.
   * @private
   */
  onGridEnhanced(data) {
    console.log("Grid enhancement active:", data.renderer);

    // Optional: Add performance monitoring UI
    this.showPerformanceIndicator();
  }

  /**
   * Handles the `blockDragEnd` event, indicating a block has been moved.
   * @param {object} data - The event data, including block ID and new position.
   * @private
   */
  onBlockMoved(data) {
    console.log("Block moved with enhancement:", data.blockId, data.position);

    // Optional: Add analytics or audit logging
    this.logBlockMovement(data);
  }

  /**
   * Displays a visual indicator that grid enhancements are active.
   * @private
   */
  showPerformanceIndicator() {
    // Optional: Visual indicator that enhancements are active
    const indicator = document.createElement("div");
    indicator.className = "grid-enhancement-indicator";
    indicator.textContent = "Enhanced Grid Active";
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #2ecc71;
      color: white;
      padding: 5px 10px;
      border-radius: 3px;
      font-size: 12px;
      z-index: 10000;
      opacity: 0.8;
    `;
    document.body.appendChild(indicator);

    // Remove after 3 seconds
    setTimeout(() => indicator.remove(), 3000);
  }

  /**
   * Handles the `layoutChanged` event, indicating that the layout has been persisted.
   * @param {object} changeEvent - The event data for the layout change.
   * @private
   */
  onLayoutPersisted(changeEvent) {
    console.log("Layout persisted:", changeEvent.type, changeEvent.blockId);

    // Optional: Show user feedback for layout saves
    if (
      changeEvent.changeType === "keyboard_move" ||
      changeEvent.changeType === "keyboard_resize"
    ) {
      this.showAccessibilityFeedback(
        `Block ${changeEvent.changeType.replace("keyboard_", "")} saved`,
      );
    }
  }

  /**
   * Logs block movement for analytics or auditing purposes.
   * @param {object} data - The event data for the block movement.
   * @private
   */
  trackLayoutChange(changeEvent) {
    // Optional: Analytics tracking
    this.safeEmit("analyticsEvent", {
      category: "grid_interaction",
      action: changeEvent.changeType,
      label: changeEvent.blockId,
      value: 1,
    });
  }

  /**
   * Shows accessibility feedback to the user, typically for keyboard-driven actions.
   * @param {string} message - The message to display.
   * @private
   */
  showAccessibilityFeedback(message) {
    // Temporary visual feedback for accessibility actions
    const feedback = document.createElement("div");
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #28a745;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(feedback);

    // Fade in
    requestAnimationFrame(() => {
      feedback.style.opacity = "1";
    });

    // Remove after 2 seconds
    setTimeout(() => {
      feedback.style.opacity = "0";
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }

  // Public API for toggling enhancement
  /**
   * Toggles the grid enhancement on or off.
   * @public
   */
  toggleEnhancement() {
    if (this.gridEnhancer.isEnhanced) {
      this.gridEnhancer.disable();
    } else {
      this.gridEnhancer.enhance();
    }
  }

  /**
   * Handles errors by logging them. This represents the original error handling logic.
   * @param {Error} error - The error object.
   * @private
   */
  handleError(error) {
    // Your existing error handling
    console.error("Grid error:", error);
  }

  /**
   * Cleans up all event listeners and resources used by the `MainViewWithEnhancedGrid` instance.
   * @public
   */
  destroy() {
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];
    if (this.gridEnhancer) {
      this.gridEnhancer.destroy();
    }
  }
}

/**
 * A simple integration function to enhance an existing grid in an application.
 * This function creates and initializes an `EnhancedGridRenderer` for a specified container.
 * @param {object} appViewModel - The main application view model.
 * @param {object} [options={}] - Configuration options for the grid enhancer.
 * @returns {EnhancedGridRenderer|null} The initialized `EnhancedGridRenderer` instance, or `null` if the container is not found.
 */

export function enhanceExistingGrid(appViewModel, options = {}) {
  const gridContainer = document.querySelector(".grid-container");
  if (!gridContainer) {
    console.warn("Grid container not found - enhancement skipped");
    return null;
  }

  const enhancer = new EnhancedGridRenderer(
    {
      container: gridContainer,
      appViewModel,
      options: {
        // Default persistence to HybridStateManager
        onLayoutChange: (changeEvent) => {
          if (appViewModel.hybridStateManager) {
            appViewModel.hybridStateManager.recordOperation({
              type: "grid_layout_change",
              data: changeEvent,
            });
          }
        },

        // Enable accessibility by default
        enableKeyboard: true,
        enableAria: true,

        // Allow custom options to override
        ...options,
      }
    },
    appViewModel.hybridStateManager
  );

  // Optional: Add toggle button to existing UI
  if (!options.hideToggle) {
    addEnhancementToggle(enhancer);
  }

  return enhancer;
}

/**
 * Adds a toggle button to the document body to enable/disable grid enhancements.
 * @private
 * @param {EnhancedGridRenderer} enhancer - The `EnhancedGridRenderer` instance to control.
 */
function addEnhancementToggle(enhancer) {
  const toggle = document.createElement("button");
  toggle.textContent = "Toggle Grid Enhancement";
  toggle.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #3498db;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
  `;

  toggle.addEventListener("click", () => {
    if (enhancer.isEnhanced) {
      enhancer.disable();
      toggle.textContent = "Enable Grid Enhancement";
    } else {
      enhancer.enhance();
      toggle.textContent = "Disable Grid Enhancement";
    }
  });

  document.body.appendChild(toggle);
}

// Example usage in your existing app.js or main initialization:
/*
import { enhanceExistingGrid } from './GridEnhancementIntegration.js';

// After your existing app initialization
const gridEnhancer = enhanceExistingGrid(appViewModel);

// Or if you want full control:
const mainView = new MainViewWithEnhancedGrid(appViewModel);
*/

export default MainViewWithEnhancedGrid;
