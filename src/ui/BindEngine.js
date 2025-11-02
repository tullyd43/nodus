// Shim: expose createBindEngineService used by SystemBootstrap while actual implementation lives under src/features/ui
import BindEngine from "../features/ui/BindEngine.js";

export function createBindEngineService(opts) {
	// Return a factory that matches the expected service contract in bootstrap
	return {
		async initialize() {
			// bootstrap expects a service initialization step; create a BindEngine instance and attach later as needed
			this.instance = new BindEngine(opts?.deps || {});
			return this.instance;
		},
		getInstance() {
			return this.instance;
		},
	};
}

export default BindEngine;
