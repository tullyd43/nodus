/**
 * @file EnhancedGridRenderer.js
 * @description An enhancement layer for an existing grid system that adds modern features like CSS Grid,
 * accessibility (ARIA, keyboard navigation), performance monitoring, and policy-driven behavior.
 * It integrates with the application's state management and event systems following the Nodus
 * feature development philosophy.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 * @borrows DateCore.timestamp as timestamp
 */

import { DateCore } from "../utils/DateUtils.js";

/**
 * @class EnhancedGridRenderer

/**
 * @class EnhancedGridRenderer
 * @classdesc A class that enhances an existing grid layout with modern features without replacing its core logic.
 * It layers on top of the existing DOM structure and event system to provide a more robust and accessible user experience.
 * This class is designed to be instantiated and managed by the HybridStateManager.
 * @privateFields {#stateManager, #errorHelpers, #metrics, #policyManager, #eventFlowEngine, #container, #appViewModel, #options, #isEnhanced, #isDragging, #isResizing, #currentDragItem, #performanceMode, #unsubscribeFunctions}
 */
export class EnhancedGridRenderer {
	/** @private @type {import('../core/HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../core/SystemPolicies.js').SystemPolicies|null} */
	#policyManager = null;
	/** @private @type {import('../core/EventFlowEngine.js').EventFlowEngine|null} */
	#eventFlowEngine = null;

	/** @private @type {HTMLElement|null} */
	#container = null;
	/** @private @type {object|null} */
	#appViewModel = null;
	/** @private @type {object} */
	#options = {};
	/** @private @type {boolean} */
	#isEnhanced = false;
	/** @private @type {boolean} */
	#isDragging = false;
	/** @private @type {boolean} */
	#isResizing = false;
	/** @private @type {object|null} */
	#currentDragItem = null;
	/** @private @type {boolean} */
	#performanceMode = false; // Start in full-feature mode
	/** @private @type {Function[]} */
	#unsubscribeFunctions = [];
	/** @private @type {number} */
	#gridColumns = 24;
	#rafScheduled = false;
	#pendingMouseEvent = null;
	#expanded = null; // { blockId, snapshot }
	#reflowEnabled = false;
	#liveReflow = false;
	#previewOriginals = new Map(); // blockId -> {x,y}

	/**
	 * Creates an instance of EnhancedGridRenderer.
	 * @param {import('../core/HybridStateManager.js').default} stateManager - The application's state manager.
	 */
	constructor(arg) {
		const sm = arg && arg.stateManager ? arg.stateManager : arg;
		this.#stateManager = sm;
		this.#errorHelpers = sm?.managers?.errorHelpers || null;
		this.#metrics = sm?.metricsRegistry?.namespace("grid.renderer") || null;
		this.#policyManager = sm?.managers?.policies || null;
		this.#eventFlowEngine = sm?.eventFlowEngine || null;
	}

	/**
	 * Initializes the grid enhancement. This method should be called after the main application view is ready.
	 * @param {object} gridConfig - The configuration for this grid instance.
	 * @param {HTMLElement} gridConfig.container - The container element of the grid.
	 * @param {object} gridConfig.appViewModel - The main application view model.
	 * @param {object} [gridConfig.options] - Additional options for the renderer.
	 */
	initialize(gridConfig = {}) {
		if (this.#isEnhanced) {
			return; // idempotent: silently ignore repeated initialize calls
		}

		// Resolve container with sensible fallbacks so ServiceRegistry can call initialize() without args
		this.#container =
			gridConfig.container ||
			document.querySelector(".grid-container") ||
			document.querySelector("#view-container") ||
			document.body;
		this.#appViewModel = gridConfig.appViewModel || {};
		this.#options = {
			onLayoutChange: null, // Callback for layout persistence
			enableKeyboard: true, // Enable keyboard accessibility
			enableAria: true, // Enable ARIA attributes
			...gridConfig.options,
		};

		// Read grid-wide defaults from policies when available
		try {
			const colsPolicy = this.#policyManager?.getPolicy?.(
				"grid",
				"default_columns"
			);
			if (Number.isInteger(colsPolicy) && colsPolicy > 0)
				this.#gridColumns = colsPolicy;
		} catch {
			/* noop */
		}

		// Enhance existing grid container with modern CSS Grid
		this.#setupModernGridStyles();
		this.#setupPerformanceMonitoring();
		this.#bindState();

		this.#setupEventListeners();
		// Read reflow policy once at init (listeners already present for policy changes)
		try {
			this.#reflowEnabled = !!this.#policyManager?.getPolicy?.(
				"grid",
				"reflow_on_drag_enabled"
			);
		} catch {
			this.#reflowEnabled = false;
		}
		try {
			this.#liveReflow = !!this.#policyManager?.getPolicy?.(
				"grid",
				"reflow_live_preview"
			);
		} catch {
			this.#liveReflow = false;
		}
		this.#isEnhanced = true;

		this.#metrics?.increment("grid.enhanced");
		this.#eventFlowEngine?.emit("gridEnhanced", { renderer: this });
	}

	/**
	 * Binds to state manager events to automatically refresh the grid on data changes.
	 * @private
	 */
	#bindState() {
		const refreshGrid = () => this.refresh();
		if (this.#stateManager?.on) {
			this.#unsubscribeFunctions.push(
				this.#stateManager.on("entitySaved", refreshGrid)
			);
			this.#unsubscribeFunctions.push(
				this.#stateManager.on("entityDeleted", refreshGrid)
			);
			this.#unsubscribeFunctions.push(
				this.#stateManager.on("syncCompleted", refreshGrid)
			);
		}
	}

	/**
	 * Applies modern CSS Grid styles to the container and enhances existing grid blocks.
	 * @private
	 */
	#setupModernGridStyles() {
		// Use CSS Grid while maintaining existing block structure
		const existingBlocks = this.#container.querySelectorAll(".grid-block");

		// Apply modern grid template
		this.#container.style.display = "grid";
		this.#container.style.gridTemplateColumns = `repeat(${this.#gridColumns}, 1fr)`;
		this.#container.style.gridAutoRows = "60px";
		this.#container.style.gap = "16px";
		this.#container.style.position =
			this.#container.style.position || "relative";

		// Enhance existing blocks with modern positioning
		existingBlocks.forEach((block) => this.#enhanceExistingBlock(block));

		// Enable lightweight viewport culling for large grids
		this.#setupViewportCulling();
	}

	/**
	 * Dynamically updates the number of grid columns and adjusts layout if needed.
	 * @public
	 * @param {number} columns
	 */
	setGridColumns(columns) {
		const n = Number(columns);
		if (!Number.isInteger(n) || n <= 0) return;
		this.#gridColumns = n;
		if (this.#container) {
			this.#container.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
		}
		// Adjust blocks that overflow the new column count
		try {
			const layout = this.getCurrentLayout();
			const blocks = Array.isArray(layout?.blocks) ? layout.blocks : [];
			const updates = [];
			let clamped = 0;
			for (const b of blocks) {
				let x = b.position?.x ?? b.x ?? 0;
				let w = b.position?.w ?? b.w ?? 1;
				const y = b.position?.y ?? b.y ?? 0;
				const h = b.position?.h ?? b.h ?? 1;
				const prevX = x,
					prevW = w;
				if (x >= n) {
					x = Math.max(0, n - 1);
				}
				if (x + w > n) {
					w = Math.max(1, n - x);
				}
				if (x !== prevX || w !== prevW) clamped++;
				updates.push({ blockId: b.blockId, x, y, w, h });
				// Update DOM preview
				const el = this.#container?.querySelector?.(
					`[data-block-id="${b.blockId}"]`
				);
				if (el) {
					el.style.gridColumnStart = x + 1;
					el.style.gridColumnEnd = x + w + 1;
				}
			}
			if (
				updates.length &&
				this.#appViewModel?.gridLayoutViewModel?.updatePositions
			) {
				const apply = () =>
					this.#appViewModel.gridLayoutViewModel.updatePositions(
						updates
					);
				if (typeof this.#stateManager?.transaction === "function") {
					this.#stateManager.transaction(apply);
				} else {
					apply();
				}
			}
			// Emit event with clamp info so outer system can inform user
			const payload = { columns: n, clampedCount: clamped };
			this.#eventFlowEngine?.emit("gridColumnsChanged", payload);
			this.#stateManager?.emit?.("gridColumnsChanged", payload);
		} catch {
			/* noop */
		}
	}

	/**
	 * Enhances a single, existing grid block with modern positioning, accessibility features, and event handlers.
	 * @private
	 * @param {HTMLElement} blockEl - The DOM element of the grid block.
	 */
	#enhanceExistingBlock(blockEl) {
		const blockData = this.#getBlockDataFromElement(blockEl);
		if (!blockData) return;

		// Apply constraints from dataset or fall back to grid policy defaults
		try {
			const defMinW =
				this.#policyManager?.getPolicy?.("grid", "default_min_w") ?? 1;
			const defMinH =
				this.#policyManager?.getPolicy?.("grid", "default_min_h") ?? 1;
			const defMaxW =
				this.#policyManager?.getPolicy?.("grid", "default_max_w") ??
				this.#gridColumns;
			const defMaxH =
				this.#policyManager?.getPolicy?.("grid", "default_max_h") ??
				1000;
			const minW = parseInt(blockEl.dataset.minW || String(defMinW), 10);
			const minH = parseInt(blockEl.dataset.minH || String(defMinH), 10);
			const maxW = parseInt(blockEl.dataset.maxW || String(defMaxW), 10);
			const maxH = parseInt(blockEl.dataset.maxH || String(defMaxH), 10);
			blockData.constraints = {
				minW: Math.max(1, minW),
				minH: Math.max(1, minH),
				maxW: Math.max(1, Math.min(this.#gridColumns, maxW)),
				maxH: Math.max(1, maxH),
			};
		} catch {
			/* noop */
		}

		// Add modern grid positioning
		blockEl.style.gridColumnStart = blockData.position.x + 1;
		blockEl.style.gridColumnEnd =
			blockData.position.x + blockData.position.w + 1;
		blockEl.style.gridRowStart = blockData.position.y + 1;
		blockEl.style.gridRowEnd =
			blockData.position.y + blockData.position.h + 1;

		// Add enhancement class for styling
		blockEl.classList.add("enhanced-grid-block");

		// Add accessibility attributes
		if (this.#options.enableAria) {
			this.#addAccessibilityFeatures(blockEl, blockData);
		}

		// Enhance existing resize handle if present
		const existingHandle = blockEl.querySelector(".resize-handle");
		if (existingHandle) {
			this.#enhanceResizeHandle(existingHandle, blockData);
		}

		// Add improved drag capabilities to existing drag handlers
		this.#enhanceDragCapabilities(blockEl, blockData);

		// Add keyboard support
		if (this.#options.enableKeyboard) {
			this.#addKeyboardSupport(blockEl, blockData);
		}

		// Add expand/collapse on double-click if enabled by policy
		try {
			const enabled = this.#policyManager?.getPolicy?.(
				"grid",
				"expand_enabled"
			);
			if (enabled !== false) {
				blockEl.addEventListener("dblclick", () =>
					this.#toggleExpand(blockEl, blockData)
				);
				blockEl.classList.add("expandable");
			}
		} catch {
			/* noop */
		}
	}

	/**
	 * Adds ARIA attributes and focus management to a grid block for accessibility.
	 * @private
	 * @param {HTMLElement} blockEl - The grid block element.
	 * @param {object} blockData - The data object for the block.
	 */
	#addAccessibilityFeatures(blockEl, blockData) {
		// ARIA attributes for screen readers
		blockEl.setAttribute("role", "gridcell");
		blockEl.setAttribute(
			"aria-label",
			`Grid block ${blockData.blockId} at position ${blockData.position.x}, ${blockData.position.y}`
		);
		blockEl.setAttribute(
			"aria-describedby",
			`${blockData.blockId}-instructions`
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

	/**
	 * Adds keyboard navigation and manipulation (move/resize) support to a grid block.
	 * @private
	 * @param {HTMLElement} blockEl - The grid block element.
	 * @param {object} blockData - The data object for the block.
	 */
	#addKeyboardSupport(blockEl, blockData) {
		blockEl.addEventListener("keydown", (e) => {
			if (!blockEl.matches(":focus")) return;

			let handled = false;
			const moveStep = 1;
			const resizeStep = 1;

			// Movement with arrow keys
			if (!e.shiftKey) {
				switch (e.key) {
					case "ArrowLeft":
						this.#moveBlock(blockData, -moveStep, 0);
						handled = true;
						break;
					case "ArrowRight":
						this.#moveBlock(blockData, moveStep, 0);
						handled = true;
						break;
					case "ArrowUp":
						this.#moveBlock(blockData, 0, -moveStep);
						handled = true;
						break;
					case "ArrowDown":
						this.#moveBlock(blockData, 0, moveStep);
						handled = true;
						break;
				}
			}

			// Resize with Shift+arrow keys
			if (e.shiftKey) {
				switch (e.key) {
					case "ArrowLeft":
						this.#resizeBlock(blockData, -resizeStep, 0);
						handled = true;
						break;
					case "ArrowRight":
						this.#resizeBlock(blockData, resizeStep, 0);
						handled = true;
						break;
					case "ArrowUp":
						this.#resizeBlock(blockData, 0, -resizeStep);
						handled = true;
						break;
					case "ArrowDown":
						this.#resizeBlock(blockData, 0, resizeStep);
						handled = true;
						break;
				}
			}

			if (handled) {
				e.preventDefault();

				// Update ARIA label with new position
				blockEl.setAttribute(
					"aria-label",
					`Grid block ${blockData.blockId} at position ${blockData.position.x}, ${blockData.position.y}, size ${blockData.position.w} by ${blockData.position.h}`
				);

				// Announce change to screen readers
				this.#announceChange(
					blockData,
					e.shiftKey ? "resized" : "moved"
				);
			}
		});
	}

	/**
	 * Moves a block by a given delta and persists the change.
	 * @private
	 * @param {object} blockData - The data for the block being moved.
	 * @param {number} deltaX - The change in the x-coordinate.
	 * @param {number} deltaY - The change in the y-coordinate.
	 */
	#moveBlock(blockData, deltaX, deltaY) {
		const targetX = Math.max(0, blockData.position.x + deltaX);
		const targetY = Math.max(0, blockData.position.y + deltaY);

		if (
			targetX === blockData.position.x &&
			targetY === blockData.position.y
		)
			return;

		// Enforce boundaries and collisions
		if (
			!this.#canPlace(
				blockData.blockId,
				targetX,
				targetY,
				blockData.position.w,
				blockData.position.h
			)
		) {
			return; // invalid move; ignore
		}

		blockData.position.x = targetX;
		blockData.position.y = targetY;

		// Update visual position
		const blockEl = this.#container.querySelector(
			`[data-block-id="${blockData.blockId}"]`
		);
		if (blockEl) {
			blockEl.style.gridColumnStart = targetX + 1;
			blockEl.style.gridRowStart = targetY + 1;
		}

		// Save changes
		this.#appViewModel.gridLayoutViewModel.updatePositions([
			{
				blockId: blockData.blockId,
				x: targetX,
				y: targetY,
				w: blockData.position.w,
				h: blockData.position.h,
			},
		]);

		this.#metrics?.increment("grid.keyboard_move");
		this.#triggerLayoutPersistence("keyboard_move", blockData);
	}

	/**
	 * Resizes a block by a given delta and persists the change.
	 * @private
	 * @param {object} blockData - The data for the block being resized.
	 * @param {number} deltaW - The change in width.
	 * @param {number} deltaH - The change in height.
	 */
	#resizeBlock(blockData, deltaW, deltaH) {
		const c = blockData.constraints || {
			minW: 1,
			minH: 1,
			maxW: this.#gridColumns,
			maxH: 1000,
		};
		const prevW = blockData.position.w;
		const prevH = blockData.position.h;
		const newW = Math.max(c.minW, Math.min(c.maxW, prevW + deltaW));
		const newH = Math.max(c.minH, Math.min(c.maxH, prevH + deltaH));

		// No-op if unchanged
		if (newW === prevW && newH === prevH) return;

		// Enforce boundaries and collisions
		if (
			!this.#canPlace(
				blockData.blockId,
				blockData.position.x,
				blockData.position.y,
				newW,
				newH
			)
		) {
			return; // invalid resize; ignore
		}

		blockData.position.w = newW;
		blockData.position.h = newH;

		// Update visual size
		const blockEl = this.#container.querySelector(
			`[data-block-id="${blockData.blockId}"]`
		);
		if (blockEl) {
			blockEl.style.gridColumnEnd = blockData.position.x + newW + 1;
			blockEl.style.gridRowEnd = blockData.position.y + newH + 1;
		}

		// Save changes
		this.#appViewModel.gridLayoutViewModel.updatePositions([
			{
				blockId: blockData.blockId,
				x: blockData.position.x,
				y: blockData.position.y,
				w: newW,
				h: newH,
			},
		]);

		this.#metrics?.increment("grid.keyboard_resize");
		this.#triggerLayoutPersistence("keyboard_resize", blockData);
	}

	/**
	 * Announces a change to a screen reader using an ARIA live region.
	 * @private
	 * @param {object} blockData - The data for the changed block.
	 * @param {string} action - The action that was performed (e.g., 'moved', 'resized').
	 */
	#announceChange(blockData, action) {
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

	/**
	 * Retrieves the data object for a block from its DOM element.
	 * @private
	 * @param {HTMLElement} blockEl - The grid block element.
	 * @returns {object|null} The block's data object, or null if not found.
	 */
	#getBlockDataFromElement(blockEl) {
		// Extract block data using existing patterns from main-view.js
		const blockId = blockEl.dataset.blockId;
		if (!blockId) return null;

		const currentLayout =
			this.#appViewModel.gridLayoutViewModel.getCurrentLayout();
		return currentLayout?.blocks.find((b) => b.blockId === blockId);
	}

	/**
	 * Enhances the styling and behavior of an existing resize handle on a grid block.
	 * @private
	 * @param {HTMLElement} handle - The resize handle element.
	 * @param {object} blockData - The data for the block.
	 */
	#enhanceResizeHandle(handle, blockData) {
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
			if (!this.#isResizing) {
				handle.style.opacity = "0";
			}
		});
	}

	/**
	 * Layers enhanced drag-and-drop capabilities on top of a block's existing drag handlers.
	 * @private
	 * @param {HTMLElement} blockEl - The grid block element.
	 * @param {object} blockData - The data for the block.
	 */
	#enhanceDragCapabilities(blockEl, blockData) {
		// Enhance existing drag with modern techniques while maintaining compatibility
		const existingDragHandler = blockEl.onmousedown;

		const enhancedDragStart = (e) => {
			if (e.target.classList.contains("resize-handle")) return;

			this.#isDragging = true;
			// Snapshot original position to allow revert if drop invalid
			this.#currentDragItem = {
				element: blockEl,
				data: blockData,
				orig: {
					x: blockData.position.x,
					y: blockData.position.y,
					w: blockData.position.w,
					h: blockData.position.h,
				},
			};

			// Add visual feedback
			blockEl.style.transform = "rotate(1deg)";
			blockEl.style.boxShadow = "0 8px 25px rgba(0,0,0,0.3)";
			blockEl.style.zIndex = "1000";
			blockEl.style.transition = "none";

			// Emit event for analytics/audit
			this.#eventFlowEngine?.emit("blockDragStart", {
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

	/**
	 * Sets up performance monitoring to automatically adjust grid features based on frame rate.
	 * @private
	 */
	#setupPerformanceMonitoring() {
		// Respects existing performance boundaries from the philosophy
		let frameCount = 0;
		let lastFrameTime = DateCore.timestamp();

		const monitorFrame = () => {
			frameCount++;
			const now = DateCore.timestamp();

			if (now - lastFrameTime >= 1000) {
				const fps = frameCount / ((now - lastFrameTime) / 1000);

				// Check policy override before auto-adjusting performance mode
				const manualOverride = this.#checkPerformancePolicyOverride();

				if (manualOverride === null) {
					// null means 'auto'
					// Adjust performance mode based on FPS (follows robustness principle)
					if (fps < 30 && !this.#performanceMode) {
						this.#enablePerformanceMode();
						this.#eventFlowEngine?.emit("gridPerformanceMode", {
							fps,
							enabled: true,
							reason: "auto",
						});
					} else if (fps > 50 && this.#performanceMode) {
						this.#disablePerformanceMode();
						this.#eventFlowEngine?.emit("gridPerformanceMode", {
							fps,
							enabled: false,
							reason: "auto",
						});
					}

					// Emit live FPS for analytics panel
					this.#eventFlowEngine?.emit("gridFps", {
						fps: Math.round(fps),
					});
				}

				frameCount = 0;
				lastFrameTime = now;
			}
			if (this.#isDragging || this.#isResizing) {
				requestAnimationFrame(monitorFrame);
			}
		};

		if (this.#eventFlowEngine) {
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on("blockDragStart", () =>
					requestAnimationFrame(monitorFrame)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on("blockResizeStart", () =>
					requestAnimationFrame(monitorFrame)
				)
			);

			// Listen for policy changes to update performance mode
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"policyChanged",
					this.#onPerformancePolicyChanged.bind(this)
				)
			);
		}
	}

	/**
	 * Sets up IntersectionObserver-based viewport culling to reduce work for offscreen blocks.
	 * @private
	 */
	#setupViewportCulling() {
		try {
			if (typeof IntersectionObserver === "undefined" || !this.#container)
				return;
			const io = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						const el = entry.target;
						if (entry.isIntersecting) {
							el.style.visibility = "";
							el.classList.add("in-viewport");
						} else {
							el.style.visibility = "hidden";
							el.classList.remove("in-viewport");
						}
					}
					try {
						const blocks =
							this.#container.querySelectorAll(".grid-block");
						let inView = 0;
						blocks.forEach((b) => {
							if (b.classList.contains("in-viewport")) inView++;
						});
						this.#eventFlowEngine?.emit("gridBlockVisibility", {
							inView,
							total: blocks.length,
						});
					} catch {
						/* noop */
					}
				},
				{ root: this.#container, threshold: 0 }
			);

			this.#container
				.querySelectorAll(".grid-block")
				.forEach((el) => io.observe(el));
		} catch {
			/* noop */
		}
	}

	/**
	 * Checks system policies to see if performance mode has been manually overridden by the user.
	 * @private
	 * @returns {boolean|null} `true` for forced on, `false` for forced off, `null` for auto.
	 */
	#checkPerformancePolicyOverride() {
		try {
			const manualMode = this.#policyManager?.getPolicy(
				"system",
				"grid_performance_mode"
			);

			if (manualMode !== null && manualMode !== this.#performanceMode) {
				if (manualMode) {
					this.#enablePerformanceMode();
				} else {
					this.#disablePerformanceMode();
				}
				this.#eventFlowEngine?.emit("gridPerformanceMode", {
					enabled: manualMode,
					reason: "policy_override",
				});
			}
			return manualMode;
		} catch (error) {
			this.#errorHelpers?.handleError(error, {
				component: "EnhancedGridRenderer",
				operation: "checkPerformancePolicyOverride",
				severity: "low",
			});
			return null; // Default to auto mode on error
		}
	}

	/**
	 * Handles real-time changes to the performance mode policy.
	 * @private
	 * @param {object} data - The policy change event data.
	 */
	#onPerformancePolicyChanged(data) {
		// React to policy changes in real-time
		if (data.domain === "system" && data.key === "grid_performance_mode") {
			this.#checkPerformancePolicyOverride();
		}
		// Track updates to reflow toggle
		if (data.domain === "grid" && data.key === "reflow_on_drag_enabled") {
			try {
				this.#reflowEnabled = !!this.#policyManager?.getPolicy?.(
					"grid",
					"reflow_on_drag_enabled"
				);
			} catch {
				/* noop */
			}
		}
		if (data.domain === "grid" && data.key === "reflow_live_preview") {
			try {
				this.#liveReflow = !!this.#policyManager?.getPolicy?.(
					"grid",
					"reflow_live_preview"
				);
			} catch {
				/* noop */
			}
		}
	}

	/**
	 * Enables performance mode, reducing visual effects to improve frame rate.
	 * @private
	 */
	#enablePerformanceMode() {
		if (this.#performanceMode) return;
		this.#container.classList.add("performance-mode");
		this.#performanceMode = true;
		this.#metrics?.increment("performance_mode.toggled", { status: "on" });
	}

	/**
	 * Disables performance mode, restoring full visual features.
	 * @private
	 */
	#disablePerformanceMode() {
		if (!this.#performanceMode) return;
		this.#container.classList.remove("performance-mode");
		this.#performanceMode = false;
		this.#metrics?.increment("performance_mode.toggled", { status: "off" });
	}

	/**
	 * Sets up global event listeners for drag/resize operations and for events from the core system.
	 * @private
	 */
	#setupEventListeners() {
		// Global mouse handlers for enhanced drag/resize
		document.addEventListener(
			"mousemove",
			this.#handleGlobalMouseMove.bind(this)
		);
		document.addEventListener(
			"mouseup",
			this.#handleGlobalMouseUp.bind(this)
		);

		// Listen to events from the EventFlowEngine
		if (this.#eventFlowEngine) {
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"gridRendered",
					this.#onGridRendered.bind(this)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"blockAdded",
					this.#onBlockAdded.bind(this)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"blockRemoved",
					this.#onBlockRemoved.bind(this)
				)
			);
		}
	}

	/**
	 * Handles the global `mousemove` event to process drag and resize actions.
	 * @private
	 * @param {MouseEvent} e - The mouse move event.
	 */
	#handleGlobalMouseMove(e) {
		if (!this.#isDragging && !this.#isResizing) return;
		this.#pendingMouseEvent = e;
		if (this.#rafScheduled) return;
		this.#rafScheduled = true;
		requestAnimationFrame(() => {
			this.#rafScheduled = false;
			const evt = this.#pendingMouseEvent;
			this.#pendingMouseEvent = null;
			if (!evt) return;
			if (this.#isDragging && this.#currentDragItem) {
				this.#handleEnhancedDrag(evt);
			}
		});
	}

	/**
	 * Handles the real-time dragging of a grid block, snapping it to the grid layout.
	 * @private
	 * @param {MouseEvent} e - The mouse move event.
	 */
	#handleEnhancedDrag(e) {
		// Enhanced drag with snap-to-grid and visual feedback
		const rect = this.#container.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const cellWidth = rect.width / this.#gridColumns; // Matches existing column system
		const cellHeight = 60 + 16; // cellHeight + gap

		const gridX = Math.max(0, Math.floor(x / cellWidth));
		const gridY = Math.max(0, Math.floor(y / cellHeight));

		const { element, data } = this.#currentDragItem;
		// Live reflow preview (DOM-only). If enabled, we don't block; we preview reflowed layout.
		if (this.#reflowEnabled && this.#liveReflow) {
			// Reset previous preview
			this.#resetLiveReflowPreview();
			// Move dragged item visually
			element.classList.remove("blocked");
			element.style.gridColumnStart = gridX + 1;
			element.style.gridRowStart = gridY + 1;
			data.position.x = gridX;
			data.position.y = gridY;
			// Compute preview positions for others
			this.#applyLiveReflowPreview(
				data.blockId,
				gridX,
				gridY,
				data.position.w,
				data.position.h
			);
			return;
		}

		// Default behavior: check boundaries & collisions before preview commit
		if (
			this.#canPlace(
				data.blockId,
				gridX,
				gridY,
				data.position.w,
				data.position.h
			)
		) {
			element.classList.remove("blocked");
			element.style.gridColumnStart = gridX + 1;
			element.style.gridRowStart = gridY + 1;
			data.position.x = gridX;
			data.position.y = gridY;
		} else {
			// Indicate blocked position visually
			element.classList.add("blocked");
		}
	}

	/**
	 * Handles the global `mouseup` event to finalize drag or resize operations.
	 * @private
	 * @param {MouseEvent} e - The mouse up event.
	 */
	#handleGlobalMouseUp(e) {
		if (this.#isDragging) {
			this.#endEnhancedDrag(e);
		}
		if (this.#isResizing) {
			this.#endEnhancedResize(e);
		}
	}

	/**
	 * Finalizes a drag operation, persisting the new position.
	 * @private
	 * @param {MouseEvent} e - The mouse up event.
	 */
	#endEnhancedDrag(e) {
		if (!this.#currentDragItem) return;

		const { element, data } = this.#currentDragItem;

		// Reset visual enhancements
		element.style.transform = "";
		element.style.boxShadow = "";
		element.style.zIndex = "";
		element.style.transition = "";

		// Validate final position; revert if invalid
		if (
			!this.#canPlace(
				data.blockId,
				data.position.x,
				data.position.y,
				data.position.w,
				data.position.h
			) &&
			this.#currentDragItem?.orig
		) {
			data.position.x = this.#currentDragItem.orig.x;
			data.position.y = this.#currentDragItem.orig.y;
			// snap element back
			element.style.gridColumnStart = data.position.x + 1;
			element.style.gridRowStart = data.position.y + 1;
		}
		// Save position using existing ViewModel pattern
		this.#appViewModel.gridLayoutViewModel.updatePositions([
			{
				blockId: data.blockId,
				x: data.position.x,
				y: data.position.y,
				w: data.position.w,
				h: data.position.h,
			},
		]);

		// Optionally reflow other blocks to avoid overlaps after drop
		try {
			if (this.#reflowEnabled) {
				this.#reflowAfterDrop(data.blockId);
			}
		} catch {
			/* noop */
		}

		// Emit completion event
		this.#eventFlowEngine?.emit("blockDragEnd", {
			blockId: data.blockId,
			position: data.position,
		});

		// Trigger layout change persistence
		this.#metrics?.increment("grid.drag");
		this.#triggerLayoutPersistence("drag", data);

		this.#isDragging = false;
		this.#currentDragItem = null;
	}

	#applyLiveReflowPreview(movedId, movedX, movedY, movedW, movedH) {
		const strategy = String(
			this.#policyManager?.getPolicy?.("grid", "reflow_strategy") ||
				"push_down"
		);
		if (strategy !== "push_down") return;
		const layoutBlocks = this.#getAllBlocks();
		const blocks = layoutBlocks.map((b) => ({
			blockId: b.blockId,
			x: b.position?.x ?? b.x,
			y: b.position?.y ?? b.y,
			w: b.position?.w ?? b.w,
			h: b.position?.h ?? b.h,
		}));
		const byId = new Map(blocks.map((b) => [b.blockId, b]));
		const moved = byId.get(movedId);
		if (!moved) return;
		moved.x = movedX;
		moved.y = movedY;
		moved.w = movedW;
		moved.h = movedH;

		let changed = true;
		let guard = 0;
		while (changed && guard++ < 100) {
			changed = false;
			for (const a of blocks) {
				for (const b of blocks) {
					if (a.blockId === b.blockId) continue;
					const overlapsX = a.x < b.x + b.w && a.x + a.w > b.x;
					const overlapsY = a.y < b.y + b.h && a.y + a.h > b.y;
					if (overlapsX && overlapsY) {
						const target = a.blockId === movedId ? b : a;
						const blocker = target === a ? b : a;
						const newY = blocker.y + blocker.h;
						if (target.y < newY) {
							target.y = newY;
							changed = true;
						}
					}
				}
			}
		}

		// Apply DOM-only updates and store originals for reset
		for (const b of blocks) {
			if (b.blockId === movedId) continue;
			const orig = layoutBlocks.find((x) => x.blockId === b.blockId);
			const ox = orig?.position?.x ?? orig?.x;
			const oy = orig?.position?.y ?? orig?.y;
			if (ox !== b.x || oy !== b.y) {
				if (!this.#previewOriginals.has(b.blockId)) {
					this.#previewOriginals.set(b.blockId, { x: ox, y: oy });
				}
				const el = this.#container.querySelector(
					`[data-block-id="${b.blockId}"]`
				);
				if (el) {
					el.style.gridColumnStart = b.x + 1;
					el.style.gridRowStart = b.y + 1;
				}
			}
		}
	}

	#resetLiveReflowPreview() {
		if (!this.#previewOriginals.size) return;
		for (const [blockId, pos] of this.#previewOriginals.entries()) {
			const el = this.#container.querySelector(
				`[data-block-id="${blockId}"]`
			);
			if (el) {
				el.style.gridColumnStart = (pos.x ?? 0) + 1;
				el.style.gridRowStart = (pos.y ?? 0) + 1;
			}
		}
		this.#previewOriginals.clear();
	}

	#reflowAfterDrop(movedId) {
		const strategy = String(
			this.#policyManager?.getPolicy?.("grid", "reflow_strategy") ||
				"push_down"
		);
		if (strategy !== "push_down") return;
		const blocks = this.#getAllBlocks().map((b) => ({
			blockId: b.blockId,
			x: b.position?.x ?? b.x,
			y: b.position?.y ?? b.y,
			w: b.position?.w ?? b.w,
			h: b.position?.h ?? b.h,
		}));
		// Build a map for quick access
		const byId = new Map(blocks.map((b) => [b.blockId, b]));
		const moved = byId.get(movedId);
		if (!moved) return;

		// Simple push-down reflow: for any block overlapping in X and colliding in Y, push it down below the blocker.
		let changed = true;
		let guard = 0;
		while (changed && guard++ < 100) {
			changed = false;
			for (const a of blocks) {
				for (const b of blocks) {
					if (a.blockId === b.blockId) continue;
					const overlapsX = a.x < b.x + b.w && a.x + a.w > b.x;
					const overlapsY = a.y < b.y + b.h && a.y + a.h > b.y;
					if (overlapsX && overlapsY) {
						// Push the lower-priority one down: prefer keeping the moved block in place; push the other
						const target = a.blockId === movedId ? b : a;
						const blocker = target === a ? b : a;
						const newY = blocker.y + blocker.h;
						if (target.y < newY) {
							target.y = newY;
							changed = true;
						}
					}
				}
			}
		}

		// Commit changes if any
		const updates = [];
		for (const b of blocks) {
			const orig = this.#getAllBlocks().find(
				(x) => x.blockId === b.blockId
			);
			const ox = orig?.position?.x ?? orig?.x;
			const oy = orig?.position?.y ?? orig?.y;
			if (ox !== b.x || oy !== b.y) {
				updates.push({
					blockId: b.blockId,
					x: b.x,
					y: b.y,
					w: b.w,
					h: b.h,
				});
				// live DOM preview
				const el = this.#container.querySelector(
					`[data-block-id="${b.blockId}"]`
				);
				if (el) {
					el.style.gridColumnStart = b.x + 1;
					el.style.gridRowStart = b.y + 1;
				}
			}
		}
		if (updates.length) {
			this.#stateManager?.transaction?.(() => {
				this.#appViewModel?.gridLayoutViewModel?.updatePositions(
					updates
				);
			});
			this.#eventFlowEngine?.emit("gridReflow", { movedId, updates });
		}
	}

	/**
	 * Finalizes a resize operation, persisting the new size.
	 * @private
	 * @param {MouseEvent} e - The mouse up event.
	 */
	#endEnhancedResize(e) {
		// Similar pattern for resize end
		if (this.resizeItem) {
			const data = this.resizeItem;

			// Save using existing ViewModel
			this.#appViewModel.gridLayoutViewModel.updatePositions([
				{
					blockId: data.blockId,
					x: data.position.x,
					y: data.position.y,
					w: data.position.w,
					h: data.position.h,
				},
			]);

			// Trigger layout change persistence
			this.#metrics?.increment("grid.resize");
			this.#triggerLayoutPersistence("resize", data);
		}

		this.#eventFlowEngine?.emit("blockResizeEnd", {
			/* resize data */
		});
		this.#isResizing = false;
	}

	/**
	 * Triggers the layout persistence mechanism, typically by calling a callback or emitting an event.
	 * @private
	 * @param {string} changeType - The type of change that occurred (e.g., 'drag', 'resize').
	 * @param {object} blockData - The data for the changed block.
	 */
	#triggerLayoutPersistence(changeType, blockData) {
		// Hook into HybridStateManager for instant persistence
		try {
			const layoutChangeEvent = {
				type: "layout_change",
				changeType, // 'drag', 'resize', 'add', 'remove'
				blockId: blockData.blockId,
				position: { ...blockData.position },
				timestamp: DateCore.timestamp(),
				userId: this.#appViewModel?.getCurrentUser?.()?.id,
			};

			// Emit for any listeners (audit, analytics, etc.)
			this.#eventFlowEngine?.emit("layoutChanged", layoutChangeEvent);

			// If onLayoutChange callback provided, use it
			if (this.#options?.onLayoutChange) {
				this.#options.onLayoutChange(layoutChangeEvent);
			}

			// Persist via HybridStateManager
			this.#stateManager?.recordOperation({
				type: "grid_layout_change",
				data: layoutChangeEvent,
			});
		} catch (error) {
			this.#metrics?.increment("layout_persistence.failed");
			this.#errorHelpers?.handleError(error, {
				component: "EnhancedGridRenderer",
				operation: "triggerLayoutPersistence",
				userFriendlyMessage: "Could not save layout change.",
				showToUser: false, // Or true, depending on policy
			});
		}
	}

	// Event handlers for existing system integration
	/**
	 * Handles the `gridRendered` event to enhance any newly rendered blocks.
	 * @private
	 * @param {object[]} blocks - An array of block data objects that were rendered.
	 */
	#onGridRendered(blocks) {
		// Re-enhance any new blocks that were rendered
		blocks.forEach((blockData) => {
			const blockEl = this.#container.querySelector(
				`[data-block-id="${blockData.blockId}"]`
			);
			if (blockEl && !blockEl.classList.contains("enhanced-grid-block")) {
				this.#enhanceExistingBlock(blockEl);
			}
		});
	}

	/**
	 * Handles the `blockAdded` event to enhance the new block.
	 * @private
	 * @param {object} blockData - The data for the newly added block.
	 */
	#onBlockAdded(blockData) {
		// Enhance newly added blocks
		setTimeout(() => {
			const blockEl = this.#container.querySelector(
				`[data-block-id="${blockData.blockId}"]`
			);
			if (blockEl) {
				this.#enhanceExistingBlock(blockEl);
			}
		}, 0);
	}

	/**
	 * Handles the `blockRemoved` event to clean up any related state.
	 * @private
	 * @param {object} blockData - The data for the removed block.
	 */
	#onBlockRemoved(blockData) {
		// Cleanup if needed (follows robustness principle)
		if (this.#currentDragItem?.data.blockId === blockData.blockId) {
			this.#isDragging = false;
			this.#currentDragItem = null;
		}
	}

	// Public API that integrates with existing system
	/**
	 * Refreshes the grid by re-applying styles and enhancements to all blocks.
	 * This is useful when underlying data changes require a full re-render.
	 * @public
	 */
	refresh() {
		this.#metrics?.increment("grid.refreshed");
		this.#setupModernGridStyles();
	}

	/**
	 * Re-enables the grid enhancements if they have been disabled.
	 * @public
	 */
	enhance() {
		if (!this.#isEnhanced) {
			this.initialize({
				container: this.#container,
				appViewModel: this.#appViewModel,
				options: this.#options,
			});
		}
	}

	/**
	 * Disables all enhancements, reverting the grid to its original state and behavior.
	 * @public
	 */
	disable() {
		if (!this.#isEnhanced) return;

		this.#container.style.display = "";
		this.#container.classList.remove("performance-mode");

		const blocks = this.#container.querySelectorAll(".enhanced-grid-block");
		blocks.forEach((block) => {
			block.classList.remove("enhanced-grid-block");
			block.style.gridColumnStart = "";
			block.style.gridRowStart = "";
			block.style.gridColumnEnd = "";
			block.style.gridRowEnd = "";
			// Further cleanup of event listeners and attributes would be needed for a full revert
		});

		this.#isEnhanced = false;
		this.#eventFlowEngine?.emit("gridEnhancementDisabled");
	}

	// Utility methods for external use
	/**
	 * Gets the current layout data from the application's view model.
	 * @public
	 * @returns {object|null} The current layout object.
	 */
	getCurrentLayout() {
		return (
			this.#appViewModel?.gridLayoutViewModel.getCurrentLayout() ?? null
		);
	}

	/**
	 * Programmatically updates the position and size of a block.
	 * @public
	 * @param {string} blockId - The ID of the block to update.
	 * @param {number} x - The new x-coordinate.
	 * @param {number} y - The new y-coordinate.
	 * @param {number} width - The new width.
	 * @param {number} height - The new height.
	 */
	updateBlockPosition(blockId, x, y, width, height) {
		// Provides external API while using existing ViewModel
		this.#appViewModel?.gridLayoutViewModel.updatePositions([
			{
				blockId,
				x,
				y,
				w: width,
				h: height,
			},
		]);
	}

	// -------------------------
	// Expand/collapse logic
	// -------------------------
	#toggleExpand(blockEl, blockData) {
		try {
			const mode = String(
				this.#policyManager?.getPolicy?.("grid", "expand_mode") ||
					"reflow"
			).toLowerCase();
			if (
				this.#expanded &&
				this.#expanded.blockId === blockData.blockId
			) {
				return this.#collapse(blockEl, blockData, mode);
			}
			return this.#expand(blockEl, blockData, mode);
		} catch {
			/* noop */
		}
	}

	#expand(blockEl, blockData, mode) {
		if (mode === "overlay") return this.#expandOverlay(blockEl);
		return this.#expandReflow(blockEl, blockData);
	}

	#collapse(blockEl, blockData, mode) {
		if (mode === "overlay") return this.#collapseOverlay(blockEl);
		return this.#collapseReflow(blockEl, blockData);
	}

	#expandOverlay(blockEl) {
		blockEl.classList.add("expanded-overlay");
		const id = blockEl.dataset.blockId;
		this.#expanded = { blockId: id, snapshot: null };
		this.#eventFlowEngine?.emit("blockExpanded", {
			blockId: id,
			mode: "overlay",
		});
	}

	#collapseOverlay(blockEl) {
		blockEl.classList.remove("expanded-overlay");
		const id = blockEl.dataset.blockId;
		this.#expanded = null;
		this.#eventFlowEngine?.emit("blockCollapsed", {
			blockId: id,
			mode: "overlay",
		});
	}

	#expandReflow(blockEl, blockData) {
		const fullWidth =
			this.#policyManager?.getPolicy?.(
				"grid",
				"expand_target_full_width"
			) ?? true;
		const targetRows =
			this.#policyManager?.getPolicy?.("grid", "expand_target_rows") ?? 8;
		const orig = {
			x: blockData.position.x,
			y: blockData.position.y,
			w: blockData.position.w,
			h: blockData.position.h,
		};
		const newW = fullWidth ? this.#gridColumns : orig.w;
		const newH = Math.max(orig.h, targetRows);
		const deltaH = newH - orig.h;
		const affectedX1 = orig.x;
		const affectedX2 = orig.x + newW;

		const layout = this.getCurrentLayout();
		const updates = [];
		// Expand the target block first
		updates.push({
			blockId: blockData.blockId,
			x: orig.x,
			y: orig.y,
			w: newW,
			h: newH,
		});
		// Push down overlapping blocks below or at our row start
		for (const b of layout?.blocks || []) {
			if (b.blockId === blockData.blockId) continue;
			const bx = b.position?.x ?? b.x,
				by = b.position?.y ?? b.y,
				bw = b.position?.w ?? b.w,
				bh = b.position?.h ?? b.h;
			const overlapsX = bx < affectedX2 && bx + bw > affectedX1;
			if (overlapsX && by >= orig.y) {
				updates.push({
					blockId: b.blockId,
					x: bx,
					y: by + deltaH,
					w: bw,
					h: bh,
				});
			}
		}

		this.#stateManager?.transaction?.(() => {
			this.#appViewModel?.gridLayoutViewModel?.updatePositions(updates);
		});
		this.#expanded = { blockId: blockData.blockId, snapshot: orig };
		blockEl.classList.add("expanded");
		this.#eventFlowEngine?.emit("blockExpanded", {
			blockId: blockData.blockId,
			mode: "reflow",
		});
	}

	#collapseReflow(blockEl, blockData) {
		if (!this.#expanded?.snapshot) return;
		const orig = this.#expanded.snapshot;
		const cur = {
			x: blockData.position.x,
			y: blockData.position.y,
			w: blockData.position.w,
			h: blockData.position.h,
		};
		const deltaH = cur.h - orig.h;
		const affectedX1 = orig.x;
		const affectedX2 = orig.x + cur.w;
		const layout = this.getCurrentLayout();
		const updates = [];
		// Restore target block
		updates.push({
			blockId: blockData.blockId,
			x: orig.x,
			y: orig.y,
			w: orig.w,
			h: orig.h,
		});
		// Pull up overlapping blocks that were pushed down
		for (const b of layout?.blocks || []) {
			if (b.blockId === blockData.blockId) continue;
			const bx = b.position?.x ?? b.x,
				by = b.position?.y ?? b.y,
				bw = b.position?.w ?? b.w,
				bh = b.position?.h ?? b.h;
			const overlapsX = bx < affectedX2 && bx + bw > affectedX1;
			if (overlapsX && by > orig.y) {
				updates.push({
					blockId: b.blockId,
					x: bx,
					y: Math.max(orig.y + orig.h, by - deltaH),
					w: bw,
					h: bh,
				});
			}
		}
		this.#stateManager?.transaction?.(() => {
			this.#appViewModel?.gridLayoutViewModel?.updatePositions(updates);
		});
		blockEl.classList.remove("expanded");
		this.#eventFlowEngine?.emit("blockCollapsed", {
			blockId: blockData.blockId,
			mode: "reflow",
		});
		this.#expanded = null;
	}

	// -------------------------
	// Collision/constraints helpers
	// -------------------------
	#rectsOverlap(a, b) {
		return (
			a.x < b.x + b.w &&
			a.x + a.w > b.x &&
			a.y < b.y + b.h &&
			a.y + a.h > b.y
		);
	}

	#getAllBlocks() {
		try {
			const layout = this.getCurrentLayout();
			return Array.isArray(layout?.blocks) ? layout.blocks : [];
		} catch {
			return [];
		}
	}

	#canPlace(blockId, x, y, w, h) {
		// Boundaries
		if (x < 0 || y < 0) return false;
		if (x + w > this.#gridColumns) return false;
		const me = { x, y, w, h };
		const blocks = this.#getAllBlocks();
		for (const b of blocks) {
			if (b.blockId === blockId) continue;
			const other = {
				x: b.position?.x ?? b.x,
				y: b.position?.y ?? b.y,
				w: b.position?.w ?? b.w,
				h: b.position?.h ?? b.h,
			};
			if (this.#rectsOverlap(me, other)) return false;
		}
		return true;
	}

	/**
	 * Cleans up all event listeners and resources used by the renderer.
	 * @public
	 */
	destroy() {
		this.disable();
		this.#unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		this.#unsubscribeFunctions = [];
	}
}

// CSS enhancements (minimal, builds on existing styles)
/**
 * A string of CSS styles that are injected to support the enhanced grid features.
 * @type {string}
 */
export const ENHANCED_GRID_STYLES = `
.enhanced-grid-block {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  will-change: transform;
}
.enhanced-grid-block.expandable { cursor: zoom-in; }
.enhanced-grid-block.expanded { cursor: zoom-out; }
.enhanced-grid-block.expanded-overlay {
  position: absolute !important;
  top: 0; left: 0; right: 0;
  z-index: 2000;
  width: 100% !important;
  height: auto;
  box-shadow: 0 12px 30px rgba(0,0,0,0.35);
}
.enhanced-grid-block.blocked { outline: 2px solid #dc3545; }

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
	const styleId = "enhanced-grid-styles";
	if (!document.getElementById(styleId)) {
		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = ENHANCED_GRID_STYLES;
		document.head.appendChild(style);
	}
}
