/**
 * Nodus Adaptive Grid Bootstrap
 * Lightweight custom grid renderer using native web standards.
 */
export class GridBootstrap {
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

	async render() {
		this.container.innerHTML = "";
		this.container.classList.add("nodus-grid");

		// Fetch items classified as "internal"
		const items = await this.db.queryByClassification(
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

	#updateResponsiveLayout() {
		const width = window.innerWidth;
		if (width < 600) this.options.density = "compact";
		else if (width > 1600) this.options.density = "spacious";
		else this.options.density = "normal";
		this.updateGridTemplate();
	}
}

export default GridBootstrap;
