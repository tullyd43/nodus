/**
 * Database Connection and Initialization
 *
 * This file sets up the Dexie database connection and provides
 * the main database instance for the application.
 */

class ProductivityDatabase {
	constructor() {
		this.db = new Dexie(DB_SCHEMA.name);
		this.setupSchema();
		this.setupHooks();
	}

	setupSchema() {
		// Define the schema using Dexie's format
		const schemaDefinition = {};

		for (const [storeName, storeConfig] of Object.entries(
			DB_SCHEMA.stores
		)) {
			let definition = "";

			// Add primary key
			if (storeConfig.autoIncrement) {
				definition += "++" + storeConfig.keyPath;
			} else {
				definition += storeConfig.keyPath;
			}

			// Add indexes
			if (storeConfig.indexes) {
				const indexNames = Object.keys(storeConfig.indexes);
				if (indexNames.length > 0) {
					definition += ", " + indexNames.join(", ");
				}
			}

			schemaDefinition[storeName] = definition;
		}

		this.db.version(DB_SCHEMA.version).stores(schemaDefinition);
	}

	setupHooks() {
		// Add created_at and updated_at timestamps automatically
		const tablesWithTimestamps = [
			"events",
			"items",
			"tags",
			"collections",
			"lists",
		];

		tablesWithTimestamps.forEach((tableName) => {
			if (this.db[tableName]) {
				// Hook for creating records
				this.db[tableName].hook("creating", (primKey, obj, trans) => {
					obj.created_at = new Date();
					obj.updated_at = new Date();
				});

				// Hook for updating records
				this.db[tableName].hook(
					"updating",
					(modifications, primKey, obj, trans) => {
						modifications.updated_at = new Date();
					}
				);
			}
		});

		// Audit logging hook for critical tables
		// Using 'ready' hooks to avoid transaction scope issues
		const auditedTables = [
			"events",
			"items",
			"tags",
			"links",
			"tag_assignments",
		];

		auditedTables.forEach((tableName) => {
			if (this.db[tableName]) {
				this.db[tableName].hook("creating", (primKey, obj, trans) => {
					// Use setTimeout to log audit event outside the current transaction
					setTimeout(() => {
						this.logAuditEvent(
							"CREATE",
							tableName,
							primKey,
							null,
							obj
						);
					}, 0);
				});

				this.db[tableName].hook(
					"updating",
					(modifications, primKey, obj, trans) => {
						setTimeout(() => {
							this.logAuditEvent(
								"UPDATE",
								tableName,
								primKey,
								obj,
								{ ...obj, ...modifications }
							);
						}, 0);
					}
				);

				this.db[tableName].hook("deleting", (primKey, obj, trans) => {
					setTimeout(() => {
						this.logAuditEvent(
							"DELETE",
							tableName,
							primKey,
							obj,
							null
						);
					}, 0);
				});
			}
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
			await this.db.audit_logs.add({
				actor_user_id: this.getCurrentUserId(), // We'll implement this
				action_type: action,
				object_type: objectType,
				object_id: objectId,
				prior_state: priorState ? JSON.stringify(priorState) : null,
				resulting_state: resultingState
					? JSON.stringify(resultingState)
					: null,
				timestamp: new Date(),
			});
		} catch (error) {
			console.error("Failed to log audit event:", error);
		}
	}

	getCurrentUserId() {
		// For now, return a default user ID
		// In a real app, this would come from authentication
		return 1;
	}

	async initialize() {
		try {
			await this.db.open();
			console.log("Database initialized successfully");

			// Check if we need to seed default data
			await this.seedDefaultData();

			return true;
		} catch (error) {
			console.error("Failed to initialize database:", error);
			return false;
		}
	}

	async seedDefaultData() {
		// Only seed if database is empty
		const eventCount = await this.db.events.count();
		if (eventCount > 0) return;

		console.log("Seeding default data...");

		try {
			// Create default user
			await this.db.users.add({
				username: "default_user",
				email: "user@example.com",
				created_at: new Date(),
				updated_at: new Date(),
			});

			// Create default event types
			const defaultEventTypes = [
				{ name: "Note", is_system: true, user_id: 1 },
				{ name: "Task", is_system: true, user_id: 1 },
				{ name: "Project", is_system: true, user_id: 1 },
				{ name: "Appointment", is_system: true, user_id: 1 },
				{ name: "Reminder", is_system: true, user_id: 1 },
			];

			for (const eventType of defaultEventTypes) {
				await this.db.event_types.add(eventType);
			}

			// Create default item types
			const defaultItemTypes = [
				{ name: "Consumable", is_system: true, user_id: 1 },
				{ name: "Tool", is_system: true, user_id: 1 },
				{ name: "Document", is_system: true, user_id: 1 },
			];

			for (const itemType of defaultItemTypes) {
				await this.db.item_types.add(itemType);
			}

			console.log("Default data seeded successfully");
		} catch (error) {
			console.error("Failed to seed default data:", error);
		}
	}

	// Utility method to clear all data (for testing)
	async clearAllData() {
		try {
			await this.db.delete();
			await this.db.open();
			await this.seedDefaultData();
			console.log("Database cleared and reseeded");
			return true;
		} catch (error) {
			console.error("Failed to clear database:", error);
			return false;
		}
	}

	// Get database instance
	getDb() {
		return this.db;
	}
}

// Create and export the database instance
window.appDb = new ProductivityDatabase();
