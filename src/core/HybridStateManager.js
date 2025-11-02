// Minimal shim of HybridStateManager to satisfy build-time imports after files were moved.
// This provides the small surface used by SystemBootstrap during initialization.
export class HybridStateManager {
	constructor(config = {}) {
		this.config = config;
		this.serviceRegistry = {
			async initializeAll() {
				return Promise.resolve();
			},
		};
		this.metricsRegistry = {
			timer() {
				/* noop */
			},
		};
		this.managers = {
			forensicLogger: {
				logAuditEvent() {
					/* noop */
				},
			},
		};
		this.storage = { ready: false };
	}

	emit() {
		// lightweight no-op emitter used during bootstrap; real implementation lives elsewhere
	}

	async initializeStorageSystem(_authContext) {
		// Simulate storage initialization for build-time flow
		this.storage = { ready: true, instance: {} };
		return Promise.resolve();
	}
}
