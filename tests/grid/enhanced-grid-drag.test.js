/**
 * @vitest-environment jsdom
 */
import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";

import {
	createContainer,
	makeMockStateManager,
	makeAppViewModel,
	addBlockElement,
	setupRenderer,
} from "../_helpers.js";

/* global describe,it,beforeEach,MouseEvent */
/* eslint-disable nodus/no-direct-dom-access, nodus/require-async-orchestration */

describe("EnhancedGridRenderer - drag start/end persistence", () => {
	/* eslint-disable-next-line no-unused-vars -- renderer instance is used for side-effects during init */
	let container, stateManager, _renderer, appViewModel;

	beforeEach(() => {
		container = createContainer({ width: 600, height: 400 });
		addBlockElement(container, "A");

		stateManager = makeMockStateManager();

		appViewModel = makeAppViewModel([
			{ blockId: "A", position: { x: 0, y: 0, w: 2, h: 1 } },
		]);

		_renderer = setupRenderer(EnhancedGridRenderer, {
			stateManager,
			container,
			appViewModel,
			options: { testMode: true },
		});
	});

	it("uses state transaction and forensic logger on drag end", async () => {
		// stub layout measurements
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

		const aEl = container.querySelector('[data-block-id="A"]');

		// Start drag
		aEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

		// Move slightly to the right (to col 1)
		const clientX = rect.left + (rect.width / 24) * 1 + 2;
		const clientY = rect.top + 10;
		document.dispatchEvent(
			new MouseEvent("mousemove", { clientX, clientY, bubbles: true })
		);

		// allow any async raf work
		await new Promise((r) => setTimeout(r, 20));

		// End drag
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		// allow post-drop tasks
		await new Promise((r) => setTimeout(r, 20));

		// Assertions
		expect(stateManager.transaction).toHaveBeenCalled();
		expect(
			appViewModel.gridLayoutViewModel.updatePositions
		).toHaveBeenCalled();
		expect(
			stateManager.managers.forensicLogger.logAuditEvent
		).toHaveBeenCalled();

		// verify the forensic call has the expected type and payload shape
		const call =
			stateManager.managers.forensicLogger.logAuditEvent.mock.calls[0];
		expect(call[0]).toBe("GRID_LAYOUT_CHANGED");
		expect(call[1]).toHaveProperty("updates");
	});
});
