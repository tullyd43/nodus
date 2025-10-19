/**
 * Database Connection and Initialization
 *
 * This file sets up the Dexie.js database, defines the schema from the
 * central DB_SCHEMA object, handles migrations, and configures hooks.
 * It directly implements the "Offline-First" client database layer
 * described in the system architecture.
 */

import Dexie from "https://esm.sh/dexie@3.2.4";

import { DB_SCHEMA } from "./schema.js";

/**
 * Converts the DB_SCHEMA stores object into a Dexie-compatible schema definition.
 * This keeps the schema definition centralized in schema.js while allowing
 * db.js to use it for versioning and migrations.
 * @param {object} stores - The stores object from DB_SCHEMA.
 * @returns {object} A Dexie-compatible schema definition.
 */
function generateSchemaDefinition(stores) {
	const schemaDefinition = {};
	for (const [storeName, storeConfig] of Object.entries(stores)) {
		const indexes = storeConfig.indexes
			? Object.keys(storeConfig.indexes)
			: [];

		let primaryKey;
		if (Array.isArray(storeConfig.keyPath)) {
			primaryKey = `[${storeConfig.keyPath.join("+")}]`;
		} else {
			primaryKey = storeConfig.autoIncrement
				? `++${storeConfig.keyPath}`
				: storeConfig.keyPath;
		}

		schemaDefinition[storeName] = [primaryKey, ...indexes].join(",");
	}
	return schemaDefinition;
}

class OrganizationalDatabase extends Dexie {
	constructor() {
		super(DB_SCHEMA.name);
		this.setupSchemaAndMigrations();
		this.setupHooks();
	}

	/**
	 * Defines the database schema and migration path.
	 */
	setupSchemaAndMigrations() {
		// --- Version 2: Schema from /docs/architecture/DATABASE_SCHEMA.md ---
		// This version is defined directly from the updated schema.js file.
		// Incrementing the version number triggers Dexie's migration logic.
		// For this major schema change, we are simply defining the new schema.
		// Dexie will drop old tables and add new ones, clearing existing data.
		this.version(2).stores(generateSchemaDefinition(DB_SCHEMA.stores));
	}

	/**
	 * Sets up Dexie hooks for automatic timestamping and audit logging.
	 */
	setupHooks() {
		// Add created_at and updated_at timestamps automatically
		this.tables.forEach((table) => {
			table.hook("creating", (primKey, obj, trans) => {
				const now = new Date();
				if (typeof obj.created_at === "undefined") obj.created_at = now;
				if (typeof obj.updated_at === "undefined") obj.updated_at = now;
			});

			table.hook("updating", (modifications, primKey, obj, trans) => {
				if (typeof modifications.updated_at === "undefined") {
					modifications.updated_at = new Date();
				}
			});
		});

		// Audit logging hook for critical tables
		const auditedTables = [
			"events",
			"items",
			"tags",
			"links",
			"tag_assignments",
		]
			.map((name) => this[name])
			.filter(Boolean);

		auditedTables.forEach((table) => {
			table.hook("creating", (primKey, obj, trans) => {
				trans.on("complete", () => {
					this.logAuditEvent("CREATE", table.name, primKey, null, obj);
				});
			});

			table.hook("updating", (modifications, primKey, obj, trans) => {
				trans.on("complete", () => {
					this.logAuditEvent(
						"UPDATE",
						table.name,
						primKey,
						obj,
						{ ...obj, ...modifications }
					);
				});
			});

			table.hook("deleting", (primKey, obj, trans) => {
				trans.on("complete", () => {
					this.logAuditEvent("DELETE", table.name, primKey, obj, null);
				});
			});
		});
	}

	async logAuditEvent(
		action,
		objectType,
		objectId,
		priorState,
		resultingState
	) {
		try {
			await this.transaction("rw", this.operation_logs, async () => {
				await this.operation_logs.add({
					actor_user_id: this.getCurrentUserId(),
					action_type: action,
					object_type: objectType,
					object_id: objectId,
					prior_state: priorState,
					resulting_state: resultingState,
					timestamp: new Date(),
				});
			});
		} catch (error) {
			console.error("Failed to log audit event:", error);
		}
	}

	getCurrentUserId() {
		// In a real app, this would come from an authentication service.
		return 1;
	}

	async initialize() {
		try {
			await this.open();
			console.log("Database initialized successfully");
			await this.seedDefaultData();
			return true;
		} catch (error) {
			console.error("Failed to initialize database:", error);
			return false;
		}
	}

	async seedDefaultData() {
		await this.transaction(
			"rw",
			this.users,
			this.event_types,
			this.item_types,
			async () => {
				const userCount = await this.users.count();
				if (userCount > 0) return;

				console.log("Seeding default data...");

				const userId = await this.users.add({
					username: "default_user",
					email: "user@example.com",
				});

				await this.event_types.bulkAdd([
					{ name: "Note", is_system: true, user_id: userId },
					{ name: "Task", is_system: true, user_id: userId },
					{ name: "Project", is_system: true, user_id: userId },
					{ name: "Appointment", is_system: true, user_id: userId },
					{ name: "Reminder", is_system: true, user_id: userId },
				]);

				await this.item_types.bulkAdd([
					{ name: "Consumable", is_system: true, user_id: userId },
					{ name: "Tool", is_system: true, user_id: userId },
					{ name: "Document", is_system: true, user_id: userId },
				]);

				console.log("Default data seeded successfully");
			}
		).catch((error) => {
			console.error("Failed to seed default data:", error);
		});
	}

	async clearAllData() {
		try {
			await this.delete();
			await this.open();
			console.log("Database cleared and re-initialized");
			return true;
		} catch (error) {
			console.error("Failed to clear database:", error);
			return false;
		}
	}
}

const appDb = new OrganizationalDatabase();

export default appDb;