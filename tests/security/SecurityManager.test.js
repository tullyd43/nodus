import SecurityManager from "@core/security/SecurityManager.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";


describe("SecurityManager (unit)", () => {
	let mockStateManager;
	let sm;

	beforeEach(() => {
		vi.useFakeTimers();

		mockStateManager = {
			emit: vi.fn(),
			config: { securityManagerConfig: { ttlCheckIntervalMs: 100 } },
			managers: {
				macEngine: {},
				errorHelpers: {
					tryAsync: (fn) => fn(),
					report: vi.fn(),
				},
				forensicLogger: {
					logAuditEvent: vi.fn().mockResolvedValue(undefined),
				},
			},
			metricsRegistry: { namespace: () => ({ increment: vi.fn() }) },
		};

		 
		sm = new SecurityManager({ stateManager: mockStateManager });
	});

	afterEach(() => {
		vi.useRealTimers();
		sm?.cleanup();
	});

	it("initializes and wires dependencies", async () => {
		await sm.initialize();
		expect(sm.isReady).toBe(true);
		expect(sm.mac).toBe(mockStateManager.managers.macEngine);
	});

	it("sets and returns a user context", async () => {
		await sm.setUserContext("test-user", "secret", ["ALPHA"], 1000);
		const ctx = sm.context;
		expect(ctx.userId).toBe("test-user");
		expect(ctx.level).toBe("secret");
		expect(ctx.compartments).toEqual(new Set(["ALPHA"]));
		expect(sm.hasValidContext()).toBe(true);
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextSet",
			expect.any(Object)
		);
	});

	it("returns a default subject when no context is set", () => {
		const subject = sm.getSubject();
		expect(subject.level).toBe("public");
		expect(subject.compartments).toEqual(new Set());
	});

	it("clears user context and emits an event", async () => {
		await sm.setUserContext("test-user", "secret");
		expect(sm.hasValidContext()).toBe(true);

		await sm.clearUserContext();
		expect(sm.context).toBeNull();
		expect(sm.hasValidContext()).toBe(false);
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	it("automatically clears context after TTL expires", async () => {
		await sm.initialize();
		await sm.setUserContext("test-user", "secret", [], 200);
		expect(sm.hasValidContext()).toBe(true);

		await vi.advanceTimersByTimeAsync(150);
		expect(sm.hasValidContext()).toBe(true);

		await vi.advanceTimersByTimeAsync(200);
		// Allow the ttl check callback to run
		await vi.runAllTicksAsync();
		expect(sm.hasValidContext()).toBe(false);
		expect(sm.context).toBeNull();
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	it("does not clear a valid context prematurely", async () => {
		await sm.initialize();
		await sm.setUserContext("test-user", "secret", [], 10000);
		expect(sm.hasValidContext()).toBe(true);

		await vi.advanceTimersByTimeAsync(500);
		expect(sm.hasValidContext()).toBe(true);
		expect(mockStateManager.emit).not.toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	it("cleanup stops the TTL interval", async () => {
		await sm.initialize();
		const clearSpy = vi.spyOn(globalThis, "clearInterval");
		sm.cleanup();
		expect(clearSpy).toHaveBeenCalled();
		clearSpy.mockRestore();
	});
});
