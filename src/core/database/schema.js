/**
 * Database Schema Definition (v2)
 *
 * This schema is updated to align with the 19-table structure defined in:
 * /docs/architecture/DATABASE_SCHEMA.md
 *
 * This version introduces new tables for routines, lists, file sync, and more,
 * and standardizes naming conventions.
 */

const DB_SCHEMA = {
	version: 2,
	name: "OrganizationalEcosystem",

	stores: {
		// === CORE ENTITIES ===
		users: {
			keyPath: "user_id",
			autoIncrement: true,
			indexes: {
				username: { unique: true },
				email: { unique: true },
			},
		},
		events: {
			keyPath: "event_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				event_type_id: {},
				title: {},
				priority: {},
				budget: {},
				location: {},
				due_date: {},
				status: {},
			},
		},
		items: {
			keyPath: "item_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				item_type_id: {},
				name: {},
				quantity: {},
				value: {},
				location: {},
				status: {},
			},
		},

		// === TYPE SYSTEM ===
		event_types: {
			keyPath: "event_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
			},
		},
		item_types: {
			keyPath: "item_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				category: {},
			},
		},

		// === UNIVERSAL FIELD SYSTEM ===
		field_definitions: {
			keyPath: "field_id",
			autoIncrement: true,
			indexes: {
				field_name: {},
				field_type: {},
				category: {},
			},
		},
		entity_fields: {
			keyPath: ["entity_type", "entity_id", "field_id"],
			autoIncrement: false,
			indexes: {
				entity_type: {},
				entity_id: {},
				field_id: {},
				sequence_order: {},
			},
		},

		// === UNIVERSAL SYSTEMS ===
		tags: {
			keyPath: "tag_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				"[user_id+name]": { unique: true },
			},
		},
		tag_assignments: {
			keyPath: ["taggable_type", "taggable_id", "tag_id"],
			autoIncrement: false,
			indexes: {
				tag_id: {},
				taggable_type: {},
				taggable_id: {},
			},
		},
		links: {
			keyPath: "link_id",
			autoIncrement: true,
			indexes: {
				from_type: {},
				from_id: {},
				to_type: {},
				to_id: {},
				relationship_type: {},
				"[from_type+from_id]": {},
				"[to_type+to_id]": {},
			},
		},

		// === ORGANIZATION ===
		collections: {
			keyPath: "collection_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
			},
		},
		lists: {
			keyPath: "list_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
			},
		},
		list_items: {
			keyPath: "list_item_id",
			autoIncrement: true,
			indexes: {
				list_id: {},
				text_content: {},
				linked_type: {},
				linked_id: {},
				sequence_order: {},
			},
		},

		// === ADVANCED FEATURES ===
		routines: {
			keyPath: "routine_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				event_type_id: {},
			},
		},
		routine_event_instances: {
			keyPath: "instance_id",
			autoIncrement: true,
			indexes: {
				routine_id: {},
				event_id: {},
				scheduled_date: {},
			},
		},

		// === FILE SYNC ===
		entity_files: {
			keyPath: "id",
			autoIncrement: true,
			indexes: {
				entity_type: {},
				entity_id: {},
				file_path: {},
				sync_status: {},
			},
		},

		// === INFRASTRUCTURE ===
		operation_logs: {
			keyPath: "log_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				operation_type: {},
				entity_type: {},
				entity_id: {},
				timestamp: {},
			},
		},
		deleted_entities: {
			keyPath: "deletion_id",
			autoIncrement: true,
			indexes: {
				entity_type: {},
				entity_id: {},
				entity_data: {},
				deleted_at: {},
			},
		},

		// === SYNC MANAGEMENT ===
		sync_queue: {
			keyPath: "sync_id",
			autoIncrement: true,
			indexes: {
				operation: {},
				entity_type: {},
				entity_id: {},
				created_at: {},
			},
		},
	},
};

export { DB_SCHEMA };