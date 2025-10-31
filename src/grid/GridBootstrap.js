/**
 * @file GridBootstrap.js
 * @description A lightweight, adaptive grid renderer that uses native web standards to display data from an IndexedDB source.
 * It provides a simple, responsive layout for a collection of items.
 */

/**
 * @class GridBootstrap
 * @classdesc Manages the rendering and basic interaction for a simple, adaptive grid of items,
 * adhering to V8 Parity Mandates for dependency management, security, and code structure.
 * @privateFields {#container, #db, #stateManager, #cells, #options}
 */
export class GridBootstrap {
	/** @private @type {HTMLElement} */
	#container;
	/** @private @type {import('../core/storage/ModernIndexedDB.js').default} */
	#db;
	/** @private @type {import('../core/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {Map<string, HTMLElement>} */
	#cells = new Map();
	/** @private @type {object} */
	#options;

	/**
	 * Creates an instance of GridBootstrap.
	 * @param {HTMLElement} container - The DOM element that will contain the grid.
	 * @param {import('../core/HybridStateManager.js').default} stateManager - The application's state manager for event emission.
	 * @param {object} [options={}] - Configuration options for the grid.
	 */
	constructor(container, stateManager, options = {}) {
		this.#container = container;
		this.#stateManager = stateManager;
		// V8.0 Parity: Mandate 1.2 - Access ModernIndexedDB from the stateManager
		this.#db = this.#stateManager.storage.instance;

		this.#options = Object.assign(
			{
				defaultClassification: "internal", // Default classification for grid items
				minCols: 2,
				maxCols: 6,
				density: "normal", // compact | normal | spacious
				responsive: true,
			},
			options
		);

		if (this.#options.responsive) this.#initAdaptiveListeners();
	}

	/**
	 * Fetches data from the database and renders the grid cells into the container.
	 * @public
	 * @returns {Promise<void>}
	 */
	async render() {
		this.#container.innerHTML = "";
		this.#container.classList.add("nodus-grid");

		// Fetch items classified as "internal" using the correct query method
		const items = await this.#db.query(
			"objects", // The object store name
			"classification", // The index to query
			this.#options.defaultClassification
		);

		for (const item of items) {
			const cell = document.createElement("div");
			cell.classList.add("grid-cell", `density-${this.#options.density}`);
			cell.dataset.entityId = item.id;
			cell.draggable = true;

			// V8.0 Parity: Mandate 2.1 - Avoid innerHTML for dynamic content.
			const header = document.createElement("header");
			header.textContent = item.display_name;
			cell.appendChild(header);

			const section = document.createElement("section");
			section.textContent =
				item.content?.details ?? "No details available.";
			cell.appendChild(section);

			this.attachCellEvents(cell, item);
			this.#container.appendChild(cell);
			this.#cells.set(item.id, cell);
		}

		// Auto-layout adjustment
		this.updateGridTemplate();
	}

	/**
	 * Attaches event listeners for click and drag-and-drop operations to a grid cell.
	 * @public
	 * @param {HTMLElement} cell - The DOM element for the grid cell.
	 * @param {object} item - The data item associated with the cell.
	 * @returns {void}
	 */
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

		this.#container.style.display = "grid";
		this.#container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		this.#container.style.gap = this.#computeGap();
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
			// V8.0 Parity: Use arrow function to maintain correct `this` context.
			this.#stateManager.emit("grid.cell.selected", item);
		});

		cell.addEventListener("dragstart", (e) => {
			// V8.0 Parity: Use arrow function to maintain correct `this` context.
			e.dataTransfer.setData("application/nodus-cell", item.id);
			this.#stateManager.emit("grid.cell.dragstart", { item });
		});

		cell.addEventListener("drop", (e) => {
			// V8.0 Parity: Use arrow function to maintain correct `this` context.
			const draggedId = e.dataTransfer.getData("application/nodus-cell");
			this.#stateManager.emit("grid.cell.dropped", {
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
			case "compact": // V8.0 Parity: Use const for readability.
				return "0.25rem"; // V8.0 Parity: Use const for readability.
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

		this.#stateManager?.on("ui.preference.changed", (pref) => {
			if (pref.type === "grid_density") {
				this.#options.density = pref.value;
				this.updateGridTemplate(); // V8.0 Parity: Call updateGridTemplate to refresh the grid.
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
		if (width < 600) this.#options.density = "compact";
		else if (width > 1600) this.#options.density = "spacious";
		else this.#options.density = "normal";
		this.updateGridTemplate();
	}
}

export default GridBootstrap;
