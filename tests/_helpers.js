/**
 * @vitest-environment jsdom
 * Shared test helpers for Vitest + jsdom tests.
 */

function _spy() {
	// Use global vi when available (in Vitest). Fall back to a no-op function.
	if (
		typeof globalThis.vi === "function" ||
		typeof globalThis.vi === "object"
	) {
		return globalThis.vi.fn ? globalThis.vi.fn() : () => {};
	}
	return () => {};
}

import { SafeDOM } from "@shared/lib/SafeDOM.js";

/* eslint-disable copilotGuard/require-forensic-envelope -- Test-only helpers; SafeDOM used for body manipulation */
// Test helper creating a jsdom container for unit tests - file-level disables above
export function createContainer({
	width = 600,
	height = 400,
	clientWidth,
} = {}) {
	// Use SafeDOM to clear body safely in tests
	SafeDOM.setText(document.body, "");

	const container = document.createElement("div");
	container.className = "grid-container";
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;
	if (typeof clientWidth === "number") {
		Object.defineProperty(container, "clientWidth", {
			value: clientWidth,
			configurable: true,
		});
	}

	container.getBoundingClientRect = () => ({
		left: 0,
		top: 0,
		width,
		height,
		right: width,
		bottom: height,
		x: 0,
		y: 0,
		toJSON() {},
	});

	// Append via DOM API - container is test-local
	document.body.appendChild(container);
	return container;
}

export function makeMockStateManager(overrides = {}) {
	const listeners = new Map();
	return {
		managers: {
			policies: { getPolicy: () => true },
			errorHelpers: { handleError: () => {}, try: (fn, v) => fn() },
			gridToastManager: {
				warning: _spy(),
				success: _spy(),
				info: _spy(),
			},
			// forensic logger mocked synchronously to avoid async-orchestration lint failures in helpers
			forensicLogger: { logAuditEvent: _spy() },
			...(overrides.managers || {}),
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
		metricsRegistry: { namespace: () => ({ increment: _spy() }) },
		metricsRegistryRaw: _spy(),
		recordOperation: _spy(),
		transaction: (fn) => (typeof fn === "function" ? fn() : undefined),
		undo: _spy(),
		redo: _spy(),
		...(overrides.topLevel || {}),
	};
}

export function makeAppViewModel(layout = [], overrides = {}) {
	const initial = { blocks: layout };
	return {
		gridLayoutViewModel: {
			getCurrentLayout: () => ({ ...initial }),
			updatePositions: (updates) => {
				// naive mutation for tests that expect layout changes
				initial.blocks = initial.blocks.map((b) => {
					const u = updates.find((x) => x.blockId === b.blockId);
					return u
						? { ...b, position: { x: u.x, y: u.y, w: u.w, h: u.h } }
						: b;
				});
			},
		},
		getCurrentUser: () => ({ id: "tester" }),
		...(overrides || {}),
	};
}

export function addBlockElement(container, id = "A") {
	const el = document.createElement("div");
	el.className = "grid-block";
	el.dataset.blockId = id;
	container.appendChild(el);
	return el;
}

export function setupRenderer(
	RendererClass,
	{ stateManager, container, appViewModel, options = {} }
) {
	const renderer = new RendererClass({ stateManager });
	renderer.initialize({ container, appViewModel, options });
	return renderer;
}
