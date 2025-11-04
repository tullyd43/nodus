/**
 * @vitest-environment jsdom
 */

import { HybridStateManager } from "@core/state/HybridStateManager.js";
import { StorageLoader } from "@core/storage/StorageLoader.js";
import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";

import { createContainer } from "../_helpers.js";

/* global describe,it,beforeEach,vi,MouseEvent */
/* eslint-disable nodus/no-direct-dom-access, nodus/require-async-orchestration */

// Mock StorageLoader to avoid real IndexedDB access
vi.mock("@core/storage/StorageLoader.js");

describe("EnhancedGridRenderer - undo/redo integration", () => {
	let hsm;
	let mockStorageInstance;
	let container;

	beforeEach(async () => {
		container = createContainer({ width: 600, height: 400 });

		mockStorageInstance = {
			init: vi.fn().mockResolvedValue(true),
			createStorage: vi.fn(),
			put: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
			getAll: vi.fn(),
		};

		StorageLoader.prototype.createStorage = vi
			.fn()
			.mockResolvedValue(mockStorageInstance);
		StorageLoader.prototype.init = vi.fn().mockResolvedValue(true);

		hsm = new HybridStateManager({ demoMode: true });
		await hsm.initialize({ userId: "tester" });
	});

	it("records layout change on drag end and undoes it", async () => {
		// Create a block element and a simple appViewModel
		const a = document.createElement("div");
		a.className = "grid-block";
		a.dataset.blockId = "A";
		container.appendChild(a);

		const initialLayout = {
			blocks: [{ blockId: "A", position: { x: 0, y: 0, w: 2, h: 1 } }],
		};

		const appViewModel = {
			gridLayoutViewModel: {
				getCurrentLayout: () => ({ ...initialLayout }),
				updatePositions: vi.fn((updates) => {
					// mutate the getCurrentLayout result for simplicity
					initialLayout.blocks = initialLayout.blocks.map((b) => {
						const u = updates.find((x) => x.blockId === b.blockId);
						return u
							? {
									...b,
									position: {
										x: u.x,
										y: u.y,
										w: u.w,
										h: u.h,
									},
								}
							: b;
					});
				}),
			},
			getCurrentUser: () => ({ id: "tester" }),
		};

		const renderer = new EnhancedGridRenderer({ stateManager: hsm });
		renderer.initialize({
			container,
			appViewModel,
			options: { testMode: true },
		});

		// Stub container rect for grid math
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

		// Start drag
		a.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		// Move to x=1
		const clientX = rect.left + (rect.width / 24) * 1 + 2;
		const clientY = rect.top + 10;
		document.dispatchEvent(
			new MouseEvent("mousemove", { clientX, clientY, bubbles: true })
		);
		await new Promise((r) => setTimeout(r, 20));
		// End drag
		document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 20));

		// At this point, a layout change should have been recorded
		expect(hsm.getHistoryInfo().undoSize).toBeGreaterThan(0);

		// Capture current layout after change (value intentionally unused)
		// Undo
		hsm.undo();

		// The renderer's updateBlockPosition should have been called to restore layout
		// The renderer's getCurrentLayout should now match the previous snapshot (initial)
		const restored = renderer.getCurrentLayout();
		expect(restored).not.toBeNull();
		// x should be restored to initial 0
		expect(restored.blocks[0].position.x).toBe(0);
	});
});
