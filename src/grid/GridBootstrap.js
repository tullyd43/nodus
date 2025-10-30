/**
 * @file GridBootstrap.js
 * @description A lightweight, adaptive grid renderer that uses native web standards to display data from an IndexedDB source.
 * It provides a simple, responsive layout for a collection of items.
 */

/**
 * @class GridBootstrap
 * @classdesc Manages the rendering and basic interaction for a simple, adaptive grid of items.
 */
export class GridBootstrap {
	/**
	 * Creates an instance of GridBootstrap.
	 * @param {HTMLElement} container - The DOM element that will contain the grid.
	 * @param {import('../core/storage/ModernIndexedDB.js').default} db - An instance of ModernIndexedDB for data retrieval.
	 * @param {import('../core/HybridStateManager.js').default} stateManager - The application's state manager for event emission.
	 * @param {object} [options={}] - Configuration options for the grid.
	 */
	constructor(container, db, stateManager, options = {}) {
		this.container = container;
		this.db = db; // ModernIndexedDB instance
		this.stateManager = stateManager;
		this.cells = new Map(); // Active cell registry
		this.options = Object.assign(
			{
				defaultClassification: "internal",
				minCols: 2,
				maxCols: 6,
				density: "normal", // compact | normal | spacious
				responsive: true,
			},
			options
		);

		if (this.options.responsive) this.#initAdaptiveListeners();
	}

	/**
	 * Fetches data from the database and renders the grid cells into the container.
	 * @public
	 * @returns {Promise<void>}
	 */
	async render() {
		this.container.innerHTML = "";
		this.container.classList.add("nodus-grid");

		// Fetch items classified as "internal" using the correct query method
		const items = await this.db.query(
			"objects", // The object store name
			"classification", // The index to query
			this.options.defaultClassification
		);

		for (const item of items) {
			const cell = document.createElement("div");
			cell.classList.add("grid-cell", `density-${this.options.density}`);
			cell.dataset.entityId = item.id;
			cell.draggable = true;
			cell.innerHTML = `
        <header>${item.display_name}</header>
        <section>${item.content?.details ?? "No details available."}</section>
      `;
			this.attachCellEvents(cell, item);
			this.container.appendChild(cell);
			this.cells.set(item.id, cell);
		}

		// Auto-layout adjustment
		this.updateGridTemplate();
	}

	/**
	 * Updates the grid container's CSS grid template based on the number of cells and configuration.
	 * @public
	 * @returns {void}
	 */
	updateGridTemplate() {
		const cellCount = this.cells.size || 1;
		const cols = Math.min(
			this.options.maxCols,
			Math.max(this.options.minCols, Math.ceil(Math.sqrt(cellCount)))
		);

		this.container.style.display = "grid";
		this.container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		this.container.style.gap = this.#computeGap();
	}

	/**
	 * Attaches event listeners for click and drag-and-drop operations to a grid cell.
	 * @public
	 * @param {HTMLElement} cell - The DOM element for the grid cell.
	 * @param {object} item - The data item associated with the cell.
	 * @returns {void}
	 */
	attachCellEvents(cell, item) {
		cell.addEventListener("click", () => {
			this.stateManager.emit("grid.cell.selected", item);
		});

		cell.addEventListener("dragstart", (e) => {
			e.dataTransfer.setData("application/nodus-cell", item.id);
			this.stateManager.emit("grid.cell.dragstart", { item });
		});

		cell.addEventListener("drop", (e) => {
			const draggedId = e.dataTransfer.getData("application/nodus-cell");
			this.stateManager.emit("grid.cell.dropped", {
				from: draggedId,
				to: item.id,
			});
		});
	}

	/**
	 * Computes the CSS gap value based on the configured density.
	 * @private
	 * @returns {string} The CSS gap value (e.g., '1rem').
	 */
	#computeGap() {
		switch (this.options.density) {
			case "compact":
				return "0.25rem";
			case "spacious":
				return "1.5rem";
			default:
				return "1rem";
		}
	}

	/**
	 * Initializes listeners for responsive behavior, such as window resizing and UI preference changes.
	 * @private
	 * @returns {void}
	 */
	#initAdaptiveListeners() {
		const resizeObserver = new ResizeObserver(() => {
			this.#updateResponsiveLayout();
		});
		resizeObserver.observe(document.body);

		this.stateManager?.on("ui.preference.changed", (pref) => {
			if (pref.type === "grid_density") {
				this.options.density = pref.value;
				this.updateGridTemplate();
			}
		});
	}

	/**
	 * Updates the grid's density based on the current window width.
	 * @private
	 * @returns {void}
	 */
	#updateResponsiveLayout() {
		const width = window.innerWidth;
		if (width < 600) this.options.density = "compact";
		else if (width > 1600) this.options.density = "spacious";
		else this.options.density = "normal";
		this.updateGridTemplate();
	}
}

export default GridBootstrap;
