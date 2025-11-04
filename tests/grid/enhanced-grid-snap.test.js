import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";

import { createContainer, addBlockElement } from "../_helpers.js";

/* global describe,it,beforeEach */

describe("EnhancedGridRenderer snap-to-cell helpers", () => {
	let container;
	let renderer;
	let stateManager;
	let appViewModel;

	beforeEach(() => {
		// Setup DOM container
		container = createContainer({
			width: 1200,
			height: 800,
			clientWidth: 1200,
		});

		// Create a sample layout with one occupied block
		const layout = [
			{ blockId: "blockA", position: { x: 2, y: 0, w: 2, h: 1 } },
		];

		// Add DOM element for existing block
		addBlockElement(container, "blockA");

		stateManager = {
			managers: {},
			metricsRegistry: { namespace: () => ({ increment: () => {} }) },
			eventFlowEngine: { on: () => {}, emit: () => {} },
			transaction: (fn) => fn && fn(),
			recordOperation: () => {},
			undo: () => {},
			redo: () => {},
		};

		appViewModel = {
			gridLayoutViewModel: {
				getCurrentLayout: () => ({ blocks: layout }),
				updatePositions: () => {},
			},
			getCurrentUser: () => ({ id: "test-user" }),
		};

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
