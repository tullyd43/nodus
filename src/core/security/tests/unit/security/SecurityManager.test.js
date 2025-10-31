// tests/unit/security/SecurityManager.test.js

import { MACEngine } from "@core/security/MACEngine.js";
import { SecurityManager } from "@core/security/SecurityManager.js";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Mock HybridStateManager for event emission
const mockHSM = {
	emit: vi.fn(),
};

describe("SecurityManager", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockHSM.emit.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("should initialize correctly", async () => {
		const sm = new SecurityManager();
		await sm.initialize();
		expect(sm.isReady).toBe(true);
		expect(sm.mac).toBeInstanceOf(MACEngine);
	});

	test("should set and get user context", () => {
		const sm = new SecurityManager();
		sm.bindStateManager(mockHSM);
		sm.setUserContext("test-user", "secret", ["ALPHA"], 1000);

		const context = sm.context;
		expect(context.userId).toBe("test-user");
		expect(context.level).toBe("secret");
		expect(context.compartments).toEqual(new Set(["ALPHA"]));
		expect(sm.hasValidContext()).toBe(true);
		expect(mockHSM.emit).toHaveBeenCalledWith(
			"securityContextSet",
			expect.any(Object)
		);
	});

	test("should return a default subject when no context is set", () => {
		const sm = new SecurityManager();
		const subject = sm.getSubject();
		expect(subject.level).toBe("public");
		expect(subject.compartments).toEqual(new Set());
	});

	test("should clear user context", () => {
		const sm = new SecurityManager();
		sm.bindStateManager(mockHSM);
		sm.setUserContext("test-user", "secret");
		expect(sm.hasValidContext()).toBe(true);

		sm.clearUserContext();
		expect(sm.context).toBeNull();
		expect(sm.hasValidContext()).toBe(false);
		expect(mockHSM.emit).toHaveBeenCalledWith("securityContextCleared");
	});

	test("should automatically clear context after TTL expires", async () => {
		// Use a short TTL and interval for testing
		const sm = new SecurityManager({ ttlCheckIntervalMs: 100 });
		sm.bindStateManager(mockHSM);
		await sm.initialize();

		// Set context with a 200ms TTL
		sm.setUserContext("test-user", "secret", [], 200);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time by 150ms, context should still be valid
		await vi.advanceTimersByTimeAsync(150);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time past the TTL and the check interval
		await vi.advanceTimersByTimeAsync(100);
		expect(sm.hasValidContext()).toBe(false);
		expect(sm.context).toBeNull();
		expect(mockHSM.emit).toHaveBeenCalledWith("securityContextCleared");

		sm.cleanup();
	});

	test("should not clear a valid context during TTL check", async () => {
		const sm = new SecurityManager({ ttlCheckIntervalMs: 100 });
		sm.bindStateManager(mockHSM);
		await sm.initialize();

		// Set context with a long TTL
		sm.setUserContext("test-user", "secret", [], 10000);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time, but not enough to expire
		await vi.advanceTimersByTimeAsync(500);

		// Context should still be valid, and clear should not have been called
		expect(sm.hasValidContext()).toBe(true);
		expect(mockHSM.emit).not.toHaveBeenCalledWith("securityContextCleared");

		sm.cleanup();
	});

	test("cleanup should stop the TTL check interval", async () => {
		const sm = new SecurityManager({ ttlCheckIntervalMs: 100 });
		await sm.initialize();
		// When using fake timers, spy on the mock provided by Vitest
		const clearIntervalSpy = vi.spyOn(vi.getTimerMock(), "clearInterval");

		sm.cleanup();

		expect(clearIntervalSpy).toHaveBeenCalledOnce();
		clearIntervalSpy.mockRestore(); // It's good practice to restore spies
	});
});
