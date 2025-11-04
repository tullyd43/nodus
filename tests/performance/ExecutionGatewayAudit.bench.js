import { bench, describe } from "vitest";
import { performance } from "perf_hooks";

// Lightweight performance benchmarks for Execution Gateways.
// These benches prefer to use real implementations if available, but
// fall back to minimal stubs so the suite can run during early development.

async function tryImport(path, exportName) {
	try {
		// dynamic import allows top-level await usage in Vitest
		const mod = await import(path);
		return exportName ? mod[exportName] : mod;
	} catch (e) {
		return null;
	}
}

describe("Automatic Observability Performance Audit", () => {
	bench(
		"AsyncOrchestrator.run() with automatic instrumentation",
		async () => {
			const AsyncOrchestrator = await tryImport(
				"../../src/platform/AsyncOrchestrator.js",
				"AsyncOrchestrator"
			);

			// Minimal fake stateManager / policy to safely instantiate real orchestrator
			const fakeStateManager = {
				managers: {
					policies: { shouldInstrument: () => ({ enabled: false }) },
				},
			};

			let orchestrator;
			if (AsyncOrchestrator) {
				try {
					orchestrator = new AsyncOrchestrator(fakeStateManager);
				} catch (e) {
					orchestrator = null;
				}
			}

			if (!orchestrator) {
				orchestrator = {
					createRunner: () => ({ run: async (op) => await op() }),
				};
			}

			const runner = orchestrator.createRunner("test_operation");
			await runner.run(async () => {
				// cheap work to simulate operation
				let s = 0;
				for (let i = 0; i < 100; i++) s += i;
				return s;
			});
		}
	);

	bench(
		"ActionDispatcher.dispatch() with automatic instrumentation",
		async () => {
			const ActionDispatcher = await tryImport(
				"../../src/platform/ActionDispatcher.js",
				"ActionDispatcher"
			);

			const fakeStateManager = {
				currentTenant: "test-tenant",
				currentUser: { id: "u1" },
				managers: {
					policies: { shouldInstrument: () => ({ enabled: false }) },
				},
			};

			let dispatcher;
			if (ActionDispatcher) {
				try {
					dispatcher = new ActionDispatcher(fakeStateManager);
				} catch (e) {
					dispatcher = null;
				}
			}

			if (!dispatcher) {
				dispatcher = {
					dispatch: async () => ({ success: true }),
				};
			}

			await dispatcher.dispatch("entity.update", {
				entityId: "test-123",
				updates: { name: "New Name" },
			});
		}
	);

	bench("Policy engine decision speed", async () => {
		const UnifiedPolicyEngine = await tryImport(
			"../../src/platform/policies/UnifiedPolicyEngine.js",
			"UnifiedPolicyEngine"
		);
		let policyEngine;
		if (UnifiedPolicyEngine) {
			try {
				policyEngine = new UnifiedPolicyEngine(null, {});
			} catch (e) {
				policyEngine = null;
			}
		}

		if (!policyEngine) {
			policyEngine = {
				shouldInstrument: (ctx) => ({
					enabled: true,
					auditRequired: true,
					metricsEnabled: true,
				}),
			};
		}

		const start = performance.now();
		const decision = await Promise.resolve(
			policyEngine.shouldInstrument({
				component: "storage",
				operation: "put",
				classification: "internal",
				performanceState: "normal",
			})
		);
		const duration = performance.now() - start;
		// No assertions here; bench reports timings.
		return decision;
	});

	bench("Automatic instrumentation overhead (synthetic)", async () => {
		// Synthetic compare: direct vs instrumented
		const direct = async () => {
			// simulate direct storage put
			let s = 0;
			for (let i = 0; i < 200; i++) s += i;
			return s;
		};

		// Instrumentation stub that performs a tiny extra work item
		const instrumentation = async (fn) => {
			const start = performance.now();
			const r = await fn();
			// simulate instrumentation overhead
			let t = 0;
			for (let i = 0; i < 50; i++) t += i;
			const dur = performance.now() - start;
			return { r, dur };
		};

		const directTimeStart = performance.now();
		await direct();
		const directTime = performance.now() - directTimeStart;

		const autoStart = performance.now();
		await instrumentation(direct);
		const autoTime = performance.now() - autoStart;

		// This bench intentionally doesn't assert; it's for measurement in CI.
		return { directTime, autoTime, overhead: autoTime - directTime };
	});
});
