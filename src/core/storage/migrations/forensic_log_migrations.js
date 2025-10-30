/**
 * @file forensic_log_migrations.js
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
			// This version is a placeholder for the initial creation.
			// The main object store is created in ModernIndexedDB if it doesn't exist.
			// We only need to add migrations for versions > 1.
		},
	},
	{
		version: 2,
		migrate: (db, transaction, oldVersion) => {
			// This migration adds new indexes for better query performance.
			// First, get a reference to the object store.
			const store = transaction.objectStore("audit_events");

			// Add an index on the 'type' field for filtering events by type.
			store.createIndex("type", "type", { unique: false });
			// Add an index on the 'userId' field for auditing specific users.
			store.createIndex("userId", "userId", { unique: false });
		},
	},
];
