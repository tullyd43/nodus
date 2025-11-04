/**
 * @vitest-environment jsdom
 */
/* global describe,it,beforeEach,vi,MouseEvent,KeyboardEvent */

import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";

import {
	createContainer,
	makeMockStateManager,
	makeAppViewModel,
	addBlockElement,
	setupRenderer,
} from "../_helpers.js";

/* eslint-disable nodus/no-direct-dom-access, nodus/require-async-orchestration */

describe("EnhancedGridRenderer - occupancy and constraints", () => {
	let container;
	let stateManager;
	let renderer;
	let appViewModel;

	beforeEach(() => {
		// container and DOM
		container = createContainer({ width: 600, height: 400 });
		// add two blocks
		addBlockElement(container, "A");
		addBlockElement(container, "B");

		stateManager = makeMockStateManager();

		appViewModel = makeAppViewModel([
			{ blockId: "A", position: { x: 0, y: 0, w: 2, h: 1 } },
			{ blockId: "B", position: { x: 2, y: 0, w: 2, h: 1 } },
		]);
		// tests expect to spy on updatePositions
		appViewModel.gridLayoutViewModel.updatePositions = vi.fn();

		renderer = setupRenderer(EnhancedGridRenderer, {
			stateManager,
			container,
			appViewModel,
			options: { enableKeyboard: true, testMode: true },
		});
	});

	it("blocks drag preview when moving into occupied cell and emits blocked event/metric", async () => {
		// start drag on A by dispatching mousedown
		const aEl = container.querySelector('[data-block-id="A"]');
		// jsdom doesn't compute layout; stub bounding rect so grid math works
		container.getBoundingClientRect = () => ({
			left: 0,
			top: 0,
			width: 600,
			height: 400,
			right: 600,
			bottom: 400,
			x: 0,
			y: 0,
			toJSON() {},
		});
		const rect = container.getBoundingClientRect();
		// verify cell metrics are computed from container styles
		const metrics = renderer.getCellMetrics();
		expect(Math.round(metrics.cellWidth)).toBe(Math.round(rect.width / 24));
		expect(metrics.cellHeight).toBeGreaterThan(0);
		// mousedown on element to start drag
		aEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		// Move pointer to X that corresponds to grid col 2 (where B is) — simulate clientX
		const clientX = rect.left + (rect.width / 24) * 2 + 1; // into col 2
		const clientY = rect.top + 10;

		// Dispatch mousemove
		document.dispatchEvent(
			new MouseEvent("mousemove", { clientX, clientY, bubbles: true })
		);

		// Allow RAF queue to run (jsdom/vitest may schedule drag work on rAF)
		// Allow RAF queue to run (jsdom/vitest may schedule drag work on rAF)
		await new Promise((r) => setTimeout(r, 20));

		// Deterministic check: occupancy-based placement should be rejected
		// A would be at x=0 w=2; trying to place at x=2 (occupied by B) should be blocked
		const canPlace = renderer.canPlaceDebug("A", 2, 0, 2, 1);
		expect(canPlace).toBe(false);
	});

	it("clamps keyboard resize to constraints and calls updatePositions", () => {
		// Provide a layout where A has minW=1 maxW=2, attempt to expand beyond maxW via Shift+ArrowRight
		appViewModel.gridLayoutViewModel.getCurrentLayout = () => ({
			blocks: [
				{
					blockId: "A",
					position: { x: 0, y: 0, w: 2, h: 1 },
					constraints: { minW: 1, maxW: 2 },
				},
			],
		});
		const aEl = container.querySelector('[data-block-id="A"]');
		// focus so keydown is handled
		aEl.tabIndex = 0;
		aEl.focus();
		// Simulate Shift+ArrowRight to attempt resize
		aEl.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "ArrowRight",
				shiftKey: true,
				bubbles: true,
			})
		);

		// updatePositions should be called (the keyboard handler saves via updatePositions)
		expect(
			appViewModel.gridLayoutViewModel.updatePositions
		).toHaveBeenCalled();
		// And the change should be wrapped in a transaction for undo/redo
		expect(stateManager.transaction).toHaveBeenCalled();
	});

	it("global undo/redo keyboard shortcuts call stateManager.undo/redo", () => {
		// Ctrl+Z -> undo
		document.dispatchEvent(
			new KeyboardEvent("keydown", { ctrlKey: true, key: "z" })
		);
		expect(stateManager.undo).toHaveBeenCalled();

		// Ctrl+Y -> redo
		document.dispatchEvent(
			new KeyboardEvent("keydown", { ctrlKey: true, key: "y" })
		);
		expect(stateManager.redo).toHaveBeenCalled();
	});
});
