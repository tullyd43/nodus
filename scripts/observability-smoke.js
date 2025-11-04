import { ObservabilityStackBootstrap } from "../src/platform/observability/ObservabilityStackBootstrap.js";

async function run() {
	const fakeStateManager = {
		managers: {
			actionDispatcher: {
				registerHandlers: (h) => {
					console.log("[smoke] registerHandlers called");
				},
			},
			policies: {
				setDefaults: (d) => {
					console.log("[smoke] policies.setDefaults called");
				},
			},
			observabilityLogger: console,
		},
		emit: (evt, data) => {
			console.log("[smoke] emit", evt, data);
		},
	};

	try {
		await ObservabilityStackBootstrap.initialize(fakeStateManager, null);
		console.log(
			"ObservabilityStackBootstrap.initialize completed without throwing."
		);
	} catch (err) {
		console.error("ObservabilityStackBootstrap.initialize threw:", err);
		process.exit(2);
	}
}

run();
