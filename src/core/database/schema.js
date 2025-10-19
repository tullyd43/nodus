/**
 * Database Schema Definition
 *
 * This file defines the complete IndexedDB schema based on our PostgreSQL design.
 * It implements the core architectural principles:
 * - Events vs Items (Verbs vs Nouns)
 * - Polymorphic relationships for tags and links
 * - Schema-driven objects with custom fields
 * - Flat, searchable network over nested hierarchies
 */

const DB_SCHEMA = {
	version: 1,
	name: "ProductivityApp",

	stores: {
		// === FOUNDATIONAL LAYER ===

		users: {
			keyPath: "user_id",
			autoIncrement: true,
			indexes: {
				email: { unique: true },
				username: { unique: true },
			},
		},

		// Core Objects: The Verb/Noun Dichotomy
		events: {
			keyPath: "event_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				event_type_id: {},
				status: {},
				due_date: {},
				project_id: {},
				phase_id: {},
				assigned_to_id: {},
				created_at: {},
				updated_at: {},
				// Compound indexes for common queries
				"[user_id+status]": {},
				"[user_id+event_type_id]": {},
				"[user_id+due_date]": {},
			},
		},

		items: {
			keyPath: "item_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				item_type_id: {},
				name: {},
				created_at: {},
				updated_at: {},
				"[user_id+item_type_id]": {},
			},
		},

		// === TEMPLATING & CUSTOM FIELDS SYSTEM (V2) ===

		event_types: {
			keyPath: "event_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_system: {},
			},
		},

		item_types: {
			keyPath: "item_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_system: {},
			},
		},

		// Defines the library of available fields
		field_definitions: {
			keyPath: "field_id",
			autoIncrement: true,
			indexes: {
				name: {},
				field_type: {}, // Index for finding all fields of a certain type
				is_indexed: {}, // Index for finding fields to promote
			},
		},

		// Stores the typed values for custom fields
		custom_field_values: {
			keyPath: "value_id",
			autoIncrement: true,
			indexes: {
				field_id: {},
				object_type: {},
				object_id: {},
				value_type: {}, // NEW: Index by type for type-specific queries
				"[object_type+object_id]": {},
				"[field_id+object_id]": { unique: true }, // A field can only have one value per object
				"[field_id+value]": {}, // NEW: Critical for range queries on typed values
			},
		},

		// === UNIVERSAL ORGANIZATION LAYER ===

		project_phases: {
			keyPath: "phase_id",
			autoIncrement: true,
			indexes: {
				project_event_id: {},
				sequence_order: {},
				"[project_event_id+sequence_order]": {},
			},
		},

		tags: {
			keyPath: "tag_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				tag_name: {},
				color: {},
				"[user_id+tag_name]": { unique: true },
			},
		},

		tag_assignments: {
			keyPath: "assignment_id",
			autoIncrement: true,
			indexes: {
				tag_id: {},
				taggable_type: {},
				taggable_id: {},
				"[taggable_type+taggable_id]": {},
				"[tag_id+taggable_type+taggable_id]": { unique: true },
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
				"[from_type+from_id+to_type+to_id]": { unique: true },
			},
		},

		goals: {
			keyPath: "goal_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				target_date: {},
				is_active: {},
				"[user_id+is_active]": {},
			},
		},

		collections: {
			keyPath: "collection_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_active: {},
				"[user_id+is_active]": {},
			},
		},

		lists: {
			keyPath: "list_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				created_at: {},
				updated_at: {},
			},
		},

		// === AUDIT FRAMEWORK ===

		audit_logs: {
			keyPath: "log_id",
			autoIncrement: true,
			indexes:.
			{
				actor_user_id: {},
				action_type: {},
				object_type: {},
				object_id: {},
				timestamp: {},
				"[actor_user_id+timestamp]": {},
				"[object_type+object_id]": {},
			},
		},

		operational_logs: {
			keyPath: "op_log_id",
			autoIncrement: true,
			indexes: {
				severity_level: {},
				timestamp: {},
				correlation_id: {},
			},
		},
	},
};

export { DB_SCHEMA };
