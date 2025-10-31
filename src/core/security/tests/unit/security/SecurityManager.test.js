// tests/unit/security/SecurityManager.test.js

import { ServiceRegistry } from "@core/ServiceRegistry.js";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

describe("SecurityManager", () => {
	let mockStateManager;
	let sm;
	let serviceRegistry;

	beforeEach(() => {
		vi.useFakeTimers();

		// Create a mock stateManager that provides the necessary dependencies.
		mockStateManager = {
			emit: vi.fn(),
			config: {
				securityManagerConfig: { ttlCheckIntervalMs: 100 },
			},
			managers: {
				macEngine: {
					/* Mock MACEngine if needed, but not required for these tests */
				},
				errorHelpers: {
					tryAsync: (fn) => fn(),
					report: vi.fn(),
				},
				forensicLogger: {
					logAuditEvent: vi.fn().mockResolvedValue(),
				},
			},
			metricsRegistry: {
				namespace: () => ({
					increment: vi.fn(),
				}),
			},
		};

		// Use a real ServiceRegistry to get the instance, which is compliant.
		serviceRegistry = new ServiceRegistry(mockStateManager);
	});

	afterEach(() => {
		vi.useRealTimers();
		sm?.cleanup(); // sm is the SecurityManager instance
	});

	test("should initialize correctly", async () => {
		sm = await serviceRegistry.get("securityManager");
		await sm.initialize();
		expect(sm.isReady).toBe(true);
		expect(sm.mac).toBe(mockStateManager.managers.macEngine);
	});

	test("should set and get user context", async () => {
		sm = await serviceRegistry.get("securityManager");
		await sm.setUserContext("test-user", "secret", ["ALPHA"], 1000);

		const context = sm.context;
		expect(context.userId).toBe("test-user");
		expect(context.level).toBe("secret");
		expect(context.compartments).toEqual(new Set(["ALPHA"]));
		expect(sm.hasValidContext()).toBe(true);
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextSet",
			expect.any(Object)
		);
	});

	test("should return a default subject when no context is set", async () => {
		sm = await serviceRegistry.get("securityManager"); // Get a fresh, uninitialized instance.
		const subject = sm.getSubject();
		expect(subject.level).toBe("public");
		expect(subject.compartments).toEqual(new Set());
	});

	test("should clear user context", async () => {
		sm = await serviceRegistry.get("securityManager");
		await sm.setUserContext("test-user", "secret");
		expect(sm.hasValidContext()).toBe(true);

		await sm.clearUserContext();
		expect(sm.context).toBeNull();
		expect(sm.hasValidContext()).toBe(false);
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	test("should automatically clear context after TTL expires", async () => {
		// Use a short TTL and interval for testing
		sm = await serviceRegistry.get("securityManager");
		await sm.initialize();

		// Set context with a 200ms TTL
		await sm.setUserContext("test-user", "secret", [], 200);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time by 150ms, context should still be valid
		await vi.advanceTimersByTimeAsync(150);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time past the TTL and the check interval
		await vi.advanceTimersByTimeAsync(100);
		expect(sm.hasValidContext()).toBe(false);
		expect(sm.context).toBeNull();
		expect(mockStateManager.emit).toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	test("should not clear a valid context during TTL check", async () => {
		sm = await serviceRegistry.get("securityManager");
		await sm.initialize();

		// Set context with a long TTL
		await sm.setUserContext("test-user", "secret", [], 10000);
		expect(sm.hasValidContext()).toBe(true);

		// Advance time, but not enough to expire
		await vi.advanceTimersByTimeAsync(500);

		// Context should still be valid, and clear should not have been called
		expect(sm.hasValidContext()).toBe(true);
		expect(mockStateManager.emit).not.toHaveBeenCalledWith(
			"securityContextCleared"
		);
	});

	test("cleanup should stop the TTL check interval", async () => {
		sm = await serviceRegistry.get("securityManager");
		await sm.initialize();
		// When using fake timers, spy on the mock provided by Vitest
		const clearIntervalSpy = vi.spyOn(vi.getTimerMock(), "clearInterval");

		sm.cleanup();

		expect(clearIntervalSpy).toHaveBeenCalledOnce();
		clearIntervalSpy.mockRestore(); // It's good practice to restore spies
	});
});
