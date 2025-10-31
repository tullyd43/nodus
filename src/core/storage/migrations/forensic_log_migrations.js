/**
 * @file forensic_log_migrations.js
 * @version 1.1.0
 * @description Defines the schema migrations for the ForensicLogger's IndexedDB.
 */

/**
 * An array of migration objects for the forensic log database.
 * Each object defines a database version and a `migrate` function to apply the schema changes.
 * @type {Array<{version: number, migrate: function(IDBDatabase, IDBTransaction, number): void}>}
 */
export const forensicLogMigrations = [
	{
		version: 1,
		migrate: (db, transaction, oldVersion) => {
			// Version 1: Initial schema creation.
			// The 'audit_events' object store with 'id' as keyPath is created by ModernIndexedDB.
			// No additional changes are needed in this migration.
		},
	},
	{
		version: 2,
		migrate: (db, transaction, oldVersion) => {
			// Version 2: Add essential indexes for querying audit events.
			// This migration improves performance for common audit scenarios.
			const store = transaction.objectStore("audit_events");

			// Mandate 2.4: Index 'type' for filtering events by category (e.g., 'SECURITY_CONTEXT_SET').
			store.createIndex("type", "type", { unique: false });

			// Mandate 2.4: Index 'userContext.userId' to allow efficient querying of actions performed by a specific user.
			// This supports creating a complete audit trail for any individual.
			store.createIndex("userId", "userContext.userId", {
				unique: false,
			});

			// Performance Pillar: Index 'timestamp' for fast time-based queries (e.g., "show all events from last 24 hours").
			store.createIndex("timestamp", "timestamp", { unique: false });
		},
	},
];
