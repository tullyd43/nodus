import { describe, it, expect, vi, beforeEach } from "vitest";

import BindEngine from "../../src/ui/BindEngine.js";

describe("BindEngine_v2", () => {
	let mockState, mockForensics, el;

	beforeEach(() => {
		mockState = {
			data: { foo: "bar" },
			get: (path) => mockState.data[path],
			subscribe: (path, cb) => {
				mockState.cb = cb;
				return () => {};
			},
			set: vi.fn((path, val) => (mockState.data[path] = val)),
			on: (evt, cb) => {},
		};
		mockForensics = {
			createEnvelope: vi.fn(async () => ({})),
			commitEnvelope: vi.fn(async () => {}),
		};
		el = document.createElement("div");
		el.setAttribute("data-bind", "foo");
	});

	it("renders state to element text", async () => {
		const engine = new BindEngine({
			stateManager: mockState,
			forensicLogger: mockForensics,
		});
		await engine.start();
		await engine.registerBinding(el, "foo");
		expect(el.textContent).toBe("bar");
	});

	it("updates element when state changes", async () => {
		const engine = new BindEngine({
			stateManager: mockState,
			forensicLogger: mockForensics,
		});
		await engine.start();
		await engine.registerBinding(el, "foo");
		mockState.data.foo = "baz";
		mockState.cb("baz");
		expect(el.textContent).toBe("baz");
	});
});
