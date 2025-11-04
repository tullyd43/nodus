import { ObservabilityStackBootstrap } from "@platform/observability/ObservabilityStackBootstrap.js";
import { describe, it, expect, vi } from "vitest";

describe("ObservabilityStackBootstrap", () => {
	/* eslint-disable-next-line nodus/require-async-orchestration -- test runner handles orchestration context */
	it("initializes observability artifacts and registers forensic registry", async () => {
		const policies = {
			setDefaults: vi.fn(),
			getPolicy: vi.fn(() => true),
		};
		const dispatcher = {
			registerHandlers: vi.fn(),
		};
		const observabilityLogger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};

		const stateManager = {
			managers: {
				actionDispatcher: dispatcher,
				policies,
				observabilityLogger,
			},
			config: { environment: "test" },
		};

		await ObservabilityStackBootstrap.initialize(stateManager, {
			observability: {},
		});

		expect(stateManager.managers.observability).toBeDefined();
		expect(
			stateManager.managers.observability.forensicRegistry
		).toBeDefined();
		expect(
			typeof stateManager.managers.observability.forensicRegistry.register
		).toBe("function");
		expect(policies.setDefaults).toHaveBeenCalled();
	});
});
