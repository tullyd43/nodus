import { HybridStateManager } from "@core/HybridStateManager.js";
import { ModernIndexedDB } from "@core/storage/ModernIndexedDB.js";
import GridBootstrap from "@grid/GridBootstrap.js";

(async () => {
	console.log("🚀 Nodus Grid Data Layer Test Starting...");

	// Initialize database
	  const db = new ModernIndexedDB("nodus_offline", "objects", 2);	await db.init();

	// Pre-seed mock data if empty
	const sample = await db.getObjectsByType("task").catch(() => []);
	if (!sample || sample.length === 0) {
		const mockData = [
			{
				id: crypto.randomUUID(),
				organization_id: "org_1",
				entity_type: "task",
				type_name: "task",
				display_name: "Program BMW CAS4 keys",
				classification: "internal",
				created_by: "user_1",
				updated_by: "user_1",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				content: { details: "Use VVDI2 or Autel IM608." },
			},
			{
				id: crypto.randomUUID(),
				organization_id: "org_1",
				entity_type: "document",
				type_name: "document",
				display_name: "Mercedes EIS Pinouts",
				classification: "restricted",
				created_by: "user_1",
				updated_by: "user_1",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				content: { notes: "Include schematic references." },
			},
		];

		for (const obj of mockData) await db.saveObject(obj);
		console.log(`📦 Seeded ${mockData.length} records to IndexedDB`);
	} else {
		console.log(`📦 IndexedDB already has ${sample.length} records`);
	}

	// Initialize Hybrid State Manager (no backend)
	const hsm = new HybridStateManager({
		offlineEnabled: true,
		enableSync: false,
		demoMode: true,
		storageConfig: {
			dbName: "nodus_offline",
			storeName: "objects",
			version: 2,
		},
	});
	await hsm.initialize();

	// Render grid
	const grid = new GridBootstrap(document.getElementById("app"), db);
	await grid.render();

	console.log(
		"✅ Grid ready (offline mode). Check console for data inspection."
	);
})();
