import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";
import { describe, it, expect, beforeEach } from "vitest";

// Minimal stubs for the stateManager and viewModel used by the renderer
function makeStateManager() {
	return {
		managers: {},
		metricsRegistry: { namespace: () => ({ increment: () => {} }) },
		eventFlowEngine: { on: () => {}, emit: () => {} },
		transaction: (fn) => fn && fn(),
		recordOperation: () => {},
		undo: () => {},
		redo: () => {},
	};
}

function makeAppViewModel(layout) {
	return {
		gridLayoutViewModel: {
			getCurrentLayout: () => ({ blocks: layout }),
			updatePositions: () => {},
		},
		getCurrentUser: () => ({ id: "test-user" }),
	};
}

describe("EnhancedGridRenderer snap-to-cell helpers", () => {
	let container;
	let renderer;
	let stateManager;
	let appViewModel;

	beforeEach(() => {
		// Setup DOM container
		container = document.createElement("div");
		container.className = "grid-container";
		// Make clientWidth available for getCellMetrics
		Object.defineProperty(container, "clientWidth", {
			value: 1200,
			configurable: true,
		});
		// Ensure getBoundingClientRect returns meaningful width/height
		container.getBoundingClientRect = () => ({
			left: 0,
			top: 0,
			width: 1200,
			height: 800,
		});
		document.body.appendChild(container);

		// Create a sample layout with one occupied block
		const layout = [
			{ blockId: "blockA", position: { x: 2, y: 0, w: 2, h: 1 } },
		];

		// Add DOM element for existing block
		const el = document.createElement("div");
		el.className = "grid-block";
		el.dataset.blockId = "blockA";
		container.appendChild(el);

		stateManager = makeStateManager();
		appViewModel = makeAppViewModel(layout);

		renderer = new EnhancedGridRenderer(stateManager);
		renderer.initialize({ container, appViewModel, options: {} });

		// Force build occupancy map based on our layout
		// updatePositions is a no-op in our stub, so we directly rely on getCurrentLayout
		renderer.getOccupancyMap();
	});

	it("snaps pixel coordinates to expected cell and allows moving the same block", () => {
		const metrics = renderer.getCellMetrics();
		const cellWidth = metrics.cellWidth;
		const cellHeight = metrics.cellHeight;

		// Pixel near center of cell x=2, y=0
		const px = (2 + 0.5) * cellWidth;
		const py = (0 + 0.5) * cellHeight;

		// When moving the same block (blockA), snap should return the rounded cell
		const res = renderer.snapToCellsDebug(px, py, "blockA");
		expect(res).toBeTruthy();
		const expectedX = Math.max(0, Math.round(px / cellWidth));
		const expectedY = Math.max(0, Math.round(py / cellHeight));
		expect(res.x).toBe(expectedX);
		expect(res.y).toBe(expectedY);
	});

	it("finds a placeable position when snapping would collide with another block", () => {
		const metrics = renderer.getCellMetrics();
		const cellWidth = metrics.cellWidth;
		const cellHeight = metrics.cellHeight;

		// Pixel near center of occupied cell x=2,y=0
		const px = (2 + 0.5) * cellWidth;
		const py = (0 + 0.5) * cellHeight;

		// Use a different block id; snap should not return the occupied cell
		const res = renderer.snapToCellsDebug(px, py, "blockB");
		expect(res).toBeTruthy();
		// Must not be the occupied cell
		expect(!(res.x === 2 && res.y === 0)).toBe(true);
		// And the suggested placement must be allowed per occupancy
		const ok = renderer.canPlaceDebug("blockB", res.x, res.y, res.w, res.h);
		expect(ok).toBe(true);
	});
});
