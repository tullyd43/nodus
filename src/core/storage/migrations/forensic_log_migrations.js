// src/core/storage/migrations/forensic_log_migrations.js

/**
 * @typedef {object} Migration
 * @property {number} version - The database version this migration applies to.
 * @property {function(IDBDatabase, IDBTransaction): void} migrate - The function to execute for the migration.
 */

/**
 * An array of migration scripts for the forensic audit log database.
 * Each object defines a version and a function to migrate the schema.
 * @type {Migration[]}
 */
export const forensicLogMigrations = [
	{
		version: 2,
		migrate: (db, transaction) => {
			const store = transaction.objectStore("audit_events");
			if (!store.indexNames.contains("type")) {
				store.createIndex("type", "type", { unique: false });
			}
		},
	},
	// Future migrations can be added here.
];

export default forensicLogMigrations;
