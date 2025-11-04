import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the observability subcomponents before importing the bootstrap
vi.mock("../../src/platform/observability/AutomaticInstrumentation.js", () => ({
	AutomaticInstrumentation: vi
		.fn()
		.mockImplementation(function (stateManager) {
			// act as a constructor
			this.precomputeInstrumentationMatrix = vi.fn();
		}),
}));

vi.mock("../../src/platform/observability/AsyncOperationTracker.js", () => ({
	AsyncOperationTracker: vi.fn().mockImplementation(function () {
		this.record = vi.fn();
	}),
}));

vi.mock("../../src/platform/observability/SyncOperationTracker.js", () => ({
	SyncOperationTracker: vi.fn().mockImplementation(function () {}),
}));

vi.mock("../../src/platform/observability/ForensicRegistry.js", () => ({
	ForensicRegistry: vi.fn().mockImplementation(function () {
		this.register = vi.fn().mockResolvedValue();
	}),
}));

vi.mock(
	"../../src/platform/observability/plugins/StorageForensicPlugin.js",
	() => ({
		StorageForensicPlugin: vi.fn().mockImplementation(function () {}),
	})
);

vi.mock(
	"../../src/platform/observability/ObservabilityCacheHandler.js",
	() => ({
		ObservabilityCacheHandler: vi.fn().mockImplementation(function () {
			// minimal constructor marker
			this.__mockHandler = true;
		}),
	})
);

vi.mock("../../src/platform/observability/PluginSignatureValidator.js", () => ({
	PluginSignatureValidator: vi.fn().mockImplementation(function () {}),
}));

// Now import the module under test (mocks are in-place)
import { AsyncOperationTracker } from "../../src/platform/observability/AsyncOperationTracker.js";
import { AutomaticInstrumentation } from "../../src/platform/observability/AutomaticInstrumentation.js";
import { ForensicRegistry } from "../../src/platform/observability/ForensicRegistry.js";
import { ObservabilityCacheHandler } from "../../src/platform/observability/ObservabilityCacheHandler.js";
import { ObservabilityStackBootstrap } from "../../src/platform/observability/ObservabilityStackBootstrap.js";

describe("ObservabilityStackBootstrap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	/* eslint-disable-next-line nodus/require-async-orchestration -- test harness runs directly, orchestrator not required for unit test */
	it("initializes components, registers handlers and sets policy defaults", async () => {
		const fakeStateManager = {
			managers: {
				policies: { setDefaults: vi.fn() },
				actionDispatcher: { registerHandlers: vi.fn() },
				observabilityLogger: {
					info: vi.fn(),
					debug: vi.fn(),
					warn: vi.fn(),
					error: vi.fn(),
				},
			},
		};

		const license = { licenseKey: "x" };

		await ObservabilityStackBootstrap.initialize(fakeStateManager, license);

		// AutomaticInstrumentation constructed with stateManager
		expect(AutomaticInstrumentation).toHaveBeenCalledWith(fakeStateManager);

		// AsyncOperationTracker constructed
		expect(AsyncOperationTracker).toHaveBeenCalledWith(fakeStateManager);

		// ForensicRegistry constructed with stateManager and license
		expect(ForensicRegistry).toHaveBeenCalledWith(
			fakeStateManager,
			license
		);
		const forensicInstance = ForensicRegistry.mock.instances[0];
		expect(forensicInstance.register).toHaveBeenCalled();

		// ActionDispatcher registered handlers with our mocked handler
		expect(
			fakeStateManager.managers.actionDispatcher.registerHandlers
		).toHaveBeenCalledWith(
			ObservabilityCacheHandler.ObservabilityCacheHandler ||
				ObservabilityCacheHandler
		);

		// Policies were given defaults
		expect(
			fakeStateManager.managers.policies.setDefaults
		).toHaveBeenCalled();
	});
});
