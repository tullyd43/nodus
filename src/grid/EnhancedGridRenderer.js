/**
 * Enhanced Grid Layout System
 * Integrates with existing project architecture following the feature development philosophy
 * - Composable: Works with existing block/widget system
 * - Simple: Enhances existing patterns rather than replacing them
 * - Robust: Graceful degradation and error handling
 * - Non-redundant: Builds on existing grid-layout-vm.js
 * - Performant: Minimal bundle impact, efficient operations
 * - Extensible: Plugin-friendly architecture
 * - Compliant: Integrates with existing audit/event systems
 */



export class EnhancedGridRenderer {
  constructor(gridOptions, stateManager) {
    this.gridOptions = gridOptions;
    this.stateManager = stateManager;
    this.container = gridOptions.container;
    this.appViewModel = gridOptions.appViewModel;
    this.options = {
      onLayoutChange: null, // Callback for layout persistence
      enableKeyboard: true, // Enable keyboard accessibility
      enableAria: true, // Enable ARIA attributes
      ...gridOptions.options,
    };
    this.isEnhanced = false;
    this.isDragging = false;
    this.isResizing = false;
    this.currentDragItem = null;
    this.performanceMode = false; // Start in full-feature mode
    this.unsubscribeFunctions = [];

    this.init();
  }

  safeEmit(eventName, detail) {
    if (typeof window.eventFlowEngine !== 'undefined') {
      window.eventFlowEngine.emit(eventName, detail);
    }
  }

  bindState() {
    const refresh = () => this.refresh?.();
    this.stateManager.on?.('entitySaved', refresh);
    this.stateManager.on?.('entityDeleted', refresh);
    this.stateManager.on?.('syncCompleted', refresh);
  }

  init() {
    // Enhance existing grid container with modern CSS Grid
    this.setupModernGridStyles();
    this.setupPerformanceMonitoring();
    this.setupEventListeners();
    this.isEnhanced = true;

    this.safeEmit("gridEnhanced", { renderer: this });
  }

  setupModernGridStyles() {
    // Use CSS Grid while maintaining existing block structure
    const existingBlocks = this.container.querySelectorAll(".grid-block");

    // Apply modern grid template
    this.container.style.display = "grid";
    this.container.style.gridTemplateColumns = "repeat(24, 1fr)";
    this.container.style.gridAutoRows = "60px";
    this.container.style.gap = "16px";

    // Enhance existing blocks with modern positioning
    existingBlocks.forEach((block) => this.enhanceExistingBlock(block));
  }

  enhanceExistingBlock(blockEl) {
    const blockData = this.getBlockDataFromElement(blockEl);
    if (!blockData) return;

    // Add modern grid positioning
    blockEl.style.gridColumnStart = blockData.position.x + 1;
    blockEl.style.gridColumnEnd =
      blockData.position.x + blockData.position.w + 1;
    blockEl.style.gridRowStart = blockData.position.y + 1;
    blockEl.style.gridRowEnd = blockData.position.y + blockData.position.h + 1;

    // Add enhancement class for styling
    blockEl.classList.add("enhanced-grid-block");

    // Add accessibility attributes
    this.addAccessibilityFeatures(blockEl, blockData);

    // Enhance existing resize handle if present
    const existingHandle = blockEl.querySelector(".resize-handle");
    if (existingHandle) {
      this.enhanceResizeHandle(existingHandle, blockData);
    }

    // Add improved drag capabilities to existing drag handlers
    this.enhanceDragCapabilities(blockEl, blockData);

    // Add keyboard support
    this.addKeyboardSupport(blockEl, blockData);
  }

  addAccessibilityFeatures(blockEl, blockData) {
    // ARIA attributes for screen readers
    blockEl.setAttribute("role", "gridcell");
    blockEl.setAttribute(
      "aria-label",
      `Grid block ${blockData.blockId} at position ${blockData.position.x}, ${blockData.position.y}`,
    );
    blockEl.setAttribute(
      "aria-describedby",
      `${blockData.blockId}-instructions`,
    );
    blockEl.setAttribute("tabindex", "0"); // Make focusable

    // Add hidden instructions for screen readers
    if (!document.getElementById(`${blockData.blockId}-instructions`)) {
      const instructions = document.createElement("div");
      instructions.id = `${blockData.blockId}-instructions`;
      instructions.className = "sr-only";
      instructions.textContent =
        "Use arrow keys to move, Shift+arrow keys to resize, Enter to activate";
      instructions.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(instructions);
    }

    // Visual focus indicator
    blockEl.addEventListener("focus", () => {
      blockEl.style.outline = "3px solid #007cba";
      blockEl.style.outlineOffset = "2px";
    });

    blockEl.addEventListener("blur", () => {
      blockEl.style.outline = "";
      blockEl.style.outlineOffset = "";
    });
  }

  addKeyboardSupport(blockEl, blockData) {
    blockEl.addEventListener("keydown", (e) => {
      if (!blockEl.matches(":focus")) return;

      let handled = false;
      const moveStep = 1;
      const resizeStep = 1;

      // Movement with arrow keys
      if (!e.shiftKey) {
        switch (e.key) {
          case "ArrowLeft":
            this.moveBlock(blockData, -moveStep, 0);
            handled = true;
            break;
          case "ArrowRight":
            this.moveBlock(blockData, moveStep, 0);
            handled = true;
            break;
          case "ArrowUp":
            this.moveBlock(blockData, 0, -moveStep);
            handled = true;
            break;
          case "ArrowDown":
            this.moveBlock(blockData, 0, moveStep);
            handled = true;
            break;
        }
      }

      // Resize with Shift+arrow keys
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowLeft":
            this.resizeBlock(blockData, -resizeStep, 0);
            handled = true;
            break;
          case "ArrowRight":
            this.resizeBlock(blockData, resizeStep, 0);
            handled = true;
            break;
          case "ArrowUp":
            this.resizeBlock(blockData, 0, -resizeStep);
            handled = true;
            break;
          case "ArrowDown":
            this.resizeBlock(blockData, 0, resizeStep);
            handled = true;
            break;
        }
      }

      if (handled) {
        e.preventDefault();

        // Update ARIA label with new position
        blockEl.setAttribute(
          "aria-label",
          `Grid block ${blockData.blockId} at position ${blockData.position.x}, ${blockData.position.y}, size ${blockData.position.w} by ${blockData.position.h}`,
        );

        // Announce change to screen readers
        this.announceChange(blockData, e.shiftKey ? "resized" : "moved");
      }
    });
  }

  moveBlock(blockData, deltaX, deltaY) {
    const newX = Math.max(0, blockData.position.x + deltaX);
    const newY = Math.max(0, blockData.position.y + deltaY);

    if (newX !== blockData.position.x || newY !== blockData.position.y) {
      blockData.position.x = newX;
      blockData.position.y = newY;

      // Update visual position
      const blockEl = this.container.querySelector(
        `[data-block-id="${blockData.blockId}"]`,
      );
      if (blockEl) {
        blockEl.style.gridColumnStart = newX + 1;
        blockEl.style.gridRowStart = newY + 1;
      }

      // Save changes
      this.appViewModel.gridLayoutViewModel.updatePositions([
        {
          blockId: blockData.blockId,
          x: newX,
          y: newY,
          w: blockData.position.w,
          h: blockData.position.h,
        },
      ]);

      this.triggerLayoutPersistence("keyboard_move", blockData);
    }
  }

  resizeBlock(blockData, deltaW, deltaH) {
    const newW = Math.max(1, blockData.position.w + deltaW);
    const newH = Math.max(1, blockData.position.h + deltaH);

    if (newW !== blockData.position.w || newH !== blockData.position.h) {
      blockData.position.w = newW;
      blockData.position.h = newH;

      // Update visual size
      const blockEl = this.container.querySelector(
        `[data-block-id="${blockData.blockId}"]`,
      );
      if (blockEl) {
        blockEl.style.gridColumnEnd = blockData.position.x + newW + 1;
        blockEl.style.gridRowEnd = blockData.position.y + newH + 1;
      }

      // Save changes
      this.appViewModel.gridLayoutViewModel.updatePositions([
        {
          blockId: blockData.blockId,
          x: blockData.position.x,
          y: blockData.position.y,
          w: newW,
          h: newH,
        },
      ]);

      this.triggerLayoutPersistence("keyboard_resize", blockData);
    }
  }

  announceChange(blockData, action) {
    // Create live region for screen reader announcements
    let liveRegion = document.getElementById("grid-live-region");
    if (!liveRegion) {
      liveRegion = document.createElement("div");
      liveRegion.id = "grid-live-region";
      liveRegion.setAttribute("aria-live", "polite");
      liveRegion.className = "sr-only";
      liveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = `Block ${action} to position ${blockData.position.x}, ${blockData.position.y}, size ${blockData.position.w} by ${blockData.position.h}`;
  }

  getBlockDataFromElement(blockEl) {
    // Extract block data using existing patterns from main-view.js
    const blockId = blockEl.dataset.blockId;
    if (!blockId) return null;

    const currentLayout =
      this.appViewModel.gridLayoutViewModel.getCurrentLayout();
    return currentLayout?.blocks.find((b) => b.blockId === blockId);
  }

  enhanceResizeHandle(handle, blockData) {
    // Enhance existing resize handle with improved UX
    handle.style.cssText += `
      width: 16px;
      height: 16px;
      background: linear-gradient(-45deg, transparent 40%, #3498db 40%, #3498db 60%, transparent 60%);
      opacity: 0;
      transition: opacity 0.2s ease;
      cursor: se-resize;
      z-index: 10;
    `;

    // Show handle on hover (respects existing patterns)
    const blockEl = handle.closest(".grid-block");
    blockEl.addEventListener("mouseenter", () => {
      handle.style.opacity = "0.7";
    });
    blockEl.addEventListener("mouseleave", () => {
      if (!this.isResizing) {
        handle.style.opacity = "0";
      }
    });
  }

  enhanceDragCapabilities(blockEl, blockData) {
    // Enhance existing drag with modern techniques while maintaining compatibility
    const existingDragHandler = blockEl.onmousedown;

    const enhancedDragStart = (e) => {
      if (e.target.classList.contains("resize-handle")) return;

      this.isDragging = true;
      this.currentDragItem = { element: blockEl, data: blockData };

      // Add visual feedback
      blockEl.style.transform = "rotate(1deg)";
      blockEl.style.boxShadow = "0 8px 25px rgba(0,0,0,0.3)";
      blockEl.style.zIndex = "1000";
      blockEl.style.transition = "none";

      // Emit event for analytics/audit (follows existing EventBus pattern)
      this.safeEmit("blockDragStart", {
        blockId: blockData.blockId,
        position: blockData.position,
      });

      // Call existing handler if present (maintains compatibility)
      if (existingDragHandler) {
        existingDragHandler.call(blockEl, e);
      }
    };

    blockEl.addEventListener("mousedown", enhancedDragStart);
  }

  setupPerformanceMonitoring() {
    // Respects existing performance boundaries from the philosophy
    let frameCount = 0;
    let lastFrameTime = performance.now();

    const monitorFrame = () => {
      frameCount++;
      const now = performance.now();

      if (now - lastFrameTime >= 1000) {
        const fps = frameCount / ((now - lastFrameTime) / 1000);

        // Check policy override before auto-adjusting performance mode
        const manualOverride = this.checkPerformancePolicyOverride();

        if (!manualOverride) {
          // Adjust performance mode based on FPS (follows robustness principle)
          if (fps < 30 && !this.performanceMode) {
            this.safeEmit("gridPerformanceMode", {
              fps,
              enabled: true,
              reason: "auto",
            });
          } else if (fps > 50 && this.performanceMode) {
            this.disablePerformanceMode();
            this.safeEmit("gridPerformanceMode", {
              fps,
              enabled: false,
              reason: "auto",
            });
          }
        }

        frameCount = 0;
        lastFrameTime = now;
      }

      if (this.isDragging || this.isResizing) {
        requestAnimationFrame(monitorFrame);
      }
    };

    if (window.eventFlowEngine) {
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("blockDragStart", () => requestAnimationFrame(monitorFrame)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("blockResizeStart", () => requestAnimationFrame(monitorFrame)));

      // Listen for policy changes to update performance mode
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("policyChanged", this.onPerformancePolicyChanged.bind(this)));
    }
  }

  checkPerformancePolicyOverride() {
    // Hook into existing SystemPolicies pattern
    try {
      // Check if user has manually set performance mode policy
      const manualMode = this.appViewModel?.context?.getPolicy?.(
        "system",
        "grid_performance_mode",
      );
      if (manualMode !== undefined && manualMode !== null) {
        if (manualMode !== this.performanceMode) {
          if (manualMode) {
            this.enablePerformanceMode();
          } else {
            this.disablePerformanceMode();
          }
          this.safeEmit("gridPerformanceMode", {
            enabled: manualMode,
            reason: "policy_override",
          });
        }
        return true; // Manual override active
      }
    } catch (error) {
      console.warn("Could not check performance policy:", error);
    }
    return false; // No manual override, use auto mode
  }

  onPerformancePolicyChanged(data) {
    // React to policy changes in real-time
    if (data.domain === "system" && data.key === "grid_performance_mode") {
      this.checkPerformancePolicyOverride();
    }
  }

  enablePerformanceMode() {
    // Reduce visual effects during performance constraints
    this.container.classList.add("performance-mode");
    this.performanceMode = true;
  }

  disablePerformanceMode() {
    this.container.classList.remove("performance-mode");
    this.performanceMode = false;
  }

  setupEventListeners() {
    // Global mouse handlers for enhanced drag/resize
    document.addEventListener(
      "mousemove",
      this.handleGlobalMouseMove.bind(this),
    );
    document.addEventListener("mouseup", this.handleGlobalMouseUp.bind(this));

    // Listen to existing events from the new EventFlowEngine
    if (window.eventFlowEngine) {
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("gridRendered", this.onGridRendered.bind(this)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("blockAdded", this.onBlockAdded.bind(this)));
      this.unsubscribeFunctions.push(window.eventFlowEngine.on("blockRemoved", this.onBlockRemoved.bind(this)));
    }
  }

  handleGlobalMouseMove(e) {
    if (!this.isDragging && !this.isResizing) return;

    if (this.isDragging && this.currentDragItem) {
      this.handleEnhancedDrag(e);
    }
  }

  handleEnhancedDrag(e) {
    // Enhanced drag with snap-to-grid and visual feedback
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellWidth = rect.width / 24; // Matches existing 24-column system
    const cellHeight = 60 + 16; // cellHeight + gap

    const gridX = Math.max(0, Math.floor(x / cellWidth));
    const gridY = Math.max(0, Math.floor(y / cellHeight));

    // Visual preview of new position
    const { element, data } = this.currentDragItem;
    element.style.gridColumnStart = gridX + 1;
    element.style.gridRowStart = gridY + 1;

    // Update internal data (maintains compatibility with existing system)
    data.position.x = gridX;
    data.position.y = gridY;
  }

  handleGlobalMouseUp(e) {
    if (this.isDragging) {
      this.endEnhancedDrag(e);
    }
    if (this.isResizing) {
      this.endEnhancedResize(e);
    }
  }

  endEnhancedDrag(e) {
    if (!this.currentDragItem) return;

    const { element, data } = this.currentDragItem;

    // Reset visual enhancements
    element.style.transform = "";
    element.style.boxShadow = "";
    element.style.zIndex = "";
    element.style.transition = "";

    // Save position using existing ViewModel pattern
    this.appViewModel.gridLayoutViewModel.updatePositions([
      {
        blockId: data.blockId,
        x: data.position.x,
        y: data.position.y,
        w: data.position.w,
        h: data.position.h,
      },
    ]);

    // Emit completion event (follows existing EventBus pattern)
    this.safeEmit("blockDragEnd", {
      blockId: data.blockId,
      position: data.position,
    });

    // Trigger layout change persistence if HybridStateManager available
    this.triggerLayoutPersistence("drag", data);

    this.isDragging = false;
    this.currentDragItem = null;
  }

  endEnhancedResize(e) {
    // Similar pattern for resize end
    if (this.resizeItem) {
      const data = this.resizeItem;

      // Save using existing ViewModel
      this.appViewModel.gridLayoutViewModel.updatePositions([
        {
          blockId: data.blockId,
          x: data.position.x,
          y: data.position.y,
          w: data.position.w,
          h: data.position.h,
        },
      ]);

      // Trigger layout change persistence
      this.triggerLayoutPersistence("resize", data);
    }

    this.safeEmit("blockResizeEnd", {
      /* resize data */
    });
    this.isResizing = false;
  }

  triggerLayoutPersistence(changeType, blockData) {
    // Hook into HybridStateManager for instant persistence
    try {
      const layoutChangeEvent = {
        type: "layout_change",
        changeType, // 'drag', 'resize', 'add', 'remove'
        blockId: blockData.blockId,
        position: { ...blockData.position },
        timestamp: Date.now(),
        userId: this.appViewModel?.getCurrentUser?.()?.id,
      };

      // Emit for any listeners (audit, analytics, etc.)
      this.safeEmit("layoutChanged", layoutChangeEvent);

      // If onLayoutChange callback provided, use it
      if (this.options?.onLayoutChange) {
        this.options.onLayoutChange(layoutChangeEvent);
      }

      // Try to persist via HybridStateManager if available
      if (this.appViewModel?.hybridStateManager) {
        this.appViewModel.hybridStateManager.recordOperation({
          type: "grid_layout_change",
          data: layoutChangeEvent,
        });
      }
    } catch (error) {
      console.warn("Layout persistence failed:", error);
      // Don't throw - grid should work even if persistence fails
    }
  }

  // Event handlers for existing system integration
  onGridRendered(blocks) {
    // Re-enhance any new blocks that were rendered
    blocks.forEach((blockData) => {
      const blockEl = this.container.querySelector(
        `[data-block-id="${blockData.blockId}"]`,
      );
      if (blockEl && !blockEl.classList.contains("enhanced-grid-block")) {
        this.enhanceExistingBlock(blockEl);
      }
    });
  }

  onBlockAdded(blockData) {
    // Enhance newly added blocks
    setTimeout(() => {
      const blockEl = this.container.querySelector(
        `[data-block-id="${blockData.blockId}"]`,
      );
      if (blockEl) {
        this.enhanceExistingBlock(blockEl);
      }
    }, 0);
  }

  onBlockRemoved(blockData) {
    // Cleanup if needed (follows robustness principle)
    if (this.currentDragItem?.data.blockId === blockData.blockId) {
      this.isDragging = false;
      this.currentDragItem = null;
    }
  }

  // Public API that integrates with existing system
  enhance() {
    if (!this.isEnhanced) {
      this.init();
    }
  }

  disable() {
    this.container.style.display = "";
    this.container.classList.remove("performance-mode");

    const blocks = this.container.querySelectorAll(".enhanced-grid-block");
    blocks.forEach((block) => {
      block.classList.remove("enhanced-grid-block");
      block.style.gridColumnStart = "";
      block.style.gridRowStart = "";
      block.style.gridColumnEnd = "";
      block.style.gridRowEnd = "";
    });

    this.isEnhanced = false;
    this.safeEmit("gridEnhancementDisabled");
  }

  // Utility methods for external use
  getCurrentLayout() {
    return this.appViewModel.gridLayoutViewModel.getCurrentLayout();
  }

  updateBlockPosition(blockId, x, y, width, height) {
    // Provides external API while using existing ViewModel
    return this.appViewModel.gridLayoutViewModel.updatePositions([
      {
        blockId,
        x,
        y,
        w: width,
        h: height,
      },
    ]);
  }

  destroy() {
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];
  }
}

// CSS enhancements (minimal, builds on existing styles)
export const ENHANCED_GRID_STYLES = `
.enhanced-grid-block {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  will-change: transform;
}

.enhanced-grid-block:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.enhanced-grid-block:focus {
  outline: 3px solid #007cba;
  outline-offset: 2px;
}

.enhanced-grid-block:focus:not(:focus-visible) {
  outline: none;
}

.performance-mode .enhanced-grid-block {
  transition: none;
  will-change: auto;
}

.performance-mode .enhanced-grid-block:hover {
  transform: none;
  box-shadow: none;
}

/* Screen reader only content */
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

/* Responsive adjustments that work with existing breakpoints */
@media (max-width: 768px) {
  .enhanced-grid-block .resize-handle {
    width: 20px;
    height: 20px;
    opacity: 0.7;
  }
  
  /* Larger touch targets for accessibility */
  .enhanced-grid-block:focus {
    outline-width: 4px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .enhanced-grid-block:focus {
    outline: 4px solid currentColor;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .enhanced-grid-block {
    transition: none;
  }
  
  .enhanced-grid-block:hover {
    transform: none;
  }
}
`;

// Auto-inject styles if in browser environment
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = ENHANCED_GRID_STYLES;
  document.head.appendChild(styleSheet);
}

export default EnhancedGridRenderer;
