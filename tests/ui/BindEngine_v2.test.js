import { describe, it, expect, vi, beforeEach } from "vitest";

import BindEngine from "../../src/features/ui/BindEngine.js";

describe("BindEngine_v2", () => {
	let mockState, mockForensics, mockSanitizer, el;

	beforeEach(() => {
		mockSanitizer = {
			cleanse: vi.fn((value) => value),
			cleanseText: vi.fn((value) => value),
		};

		mockState = {
			data: { foo: "bar" },
			get: (path) => mockState.data[path],
			subscribe: (path, cb) => {
				mockState.cb = cb;
				return () => {};
			},
			set: vi.fn((path, val) => (mockState.data[path] = val)),
			on: vi.fn(),
			managers: {
				sanitizer: mockSanitizer,
			},
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

	it("sanitizes rendered text content", async () => {
		mockSanitizer.cleanseText.mockImplementation((value) =>
			value.replace(/<[^>]*>/g, "")
		);
		mockState.data.foo = "<script>alert(1)</script>safe";

		const engine = new BindEngine({
			stateManager: mockState,
			forensicLogger: mockForensics,
		});
		await engine.start();
		await engine.registerBinding(el, "foo");
		expect(el.textContent).toBe("alert(1)safe");
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

	it("sanitizes inbound values before state updates", async () => {
		mockSanitizer.cleanseText.mockImplementation((value) =>
			value.replace(/[<>]/g, "")
		);

		const engine = new BindEngine({
			stateManager: mockState,
			forensicLogger: mockForensics,
		});
		await engine.start();

		const input = document.createElement("input");
		input.setAttribute("data-bind", "foo");
		await engine.registerBinding(input, "foo", { twoWay: true });

		input.value = "<script>alert(2)</script>";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await Promise.resolve();

		expect(mockSanitizer.cleanseText).toHaveBeenCalledWith(
			"<script>alert(2)</script>"
		);
		expect(mockState.set).toHaveBeenCalledWith("foo", "scriptalert(2)/script");
		expect(mockForensics.createEnvelope).toHaveBeenCalledWith(
			"UI_BIND_MUTATION",
			expect.objectContaining({
				path: "foo",
				value: "scriptalert(2)/script",
				source: "input",
			})
		);
	});
});
