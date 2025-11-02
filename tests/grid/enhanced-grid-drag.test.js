/**
 * @vitest-environment jsdom
 */
import { describe, it, beforeEach, expect, vi } from "vitest";

import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";

function makeMockStateManager() {
	const listeners = new Map();
	const fm = {
		managers: {
			policies: { getPolicy: () => true },
			errorHelpers: { handleError: () => {} },
			gridToastManager: {
				warning: vi.fn(),
				success: vi.fn(),
				info: vi.fn(),
			},
			forensicLogger: { logAuditEvent: vi.fn(async () => {}) },
		},
		eventFlowEngine: {
			on: (k, fn) => {
				if (!listeners.has(k)) listeners.set(k, []);
				listeners.get(k).push(fn);
				return () => {
					const arr = listeners.get(k) || [];
					listeners.set(
						k,
						arr.filter((f) => f !== fn)
					);
				};
			},
			emit: (k, d) => (listeners.get(k) || []).forEach((fn) => fn(d)),
		},
		metricsRegistry: { namespace: () => ({ increment: vi.fn() }) },
		metricsRegistryRaw: vi.fn(),
		recordOperation: vi.fn(),
		transaction: vi.fn((fn) => fn()),
		undo: vi.fn(),
		redo: vi.fn(),
	};
	return fm;
}

describe("EnhancedGridRenderer - drag start/end persistence", () => {
	let container, stateManager, renderer, appViewModel;

	beforeEach(() => {
		document.body.innerHTML = "";
		container = document.createElement("div");
		container.className = "grid-container";
		container.style.width = "600px";
		container.style.height = "400px";
		document.body.appendChild(container);

		const a = document.createElement("div");
		a.className = "grid-block";
		a.dataset.blockId = "A";
		container.appendChild(a);

		stateManager = makeMockStateManager();

		appViewModel = {
			gridLayoutViewModel: {
				getCurrentLayout: () => ({
					blocks: [
						{ blockId: "A", position: { x: 0, y: 0, w: 2, h: 1 } },
					],
				}),
				updatePositions: vi.fn(),
			},
			getCurrentUser: () => ({ id: "tester" }),
		};

		renderer = new EnhancedGridRenderer({ stateManager });
		renderer.initialize({
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
