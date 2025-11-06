/**
 * @file forensic_log_migrations.js
 * @version 2.0.0 - Enterprise Observability Baseline
 * @description Schema migrations for ForensicLogger's IndexedDB with automatic observability.
 * All migration operations flow through orchestrated patterns for complete audit trails
 * and performance monitoring compliance.
 *
 * Migration Operations:
 * - All schema changes are automatically instrumented via AsyncOrchestrator
 * - State mutations flow through ActionDispatcher for audit trails
 * - Security operations use ForensicRegistry for MAC compliance
 * - Performance budgets enforced on migration operations
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Migration patterns and observability requirements
 */

/**
 * An array of migration objects for the forensic log database.
 * Each object defines a database version and a `migrate` function to apply the schema changes.
 *
 * Key Features:
 * - Automatic instrumentation via AsyncOrchestrator for migration tracking
 * - Complete audit trails for all schema modifications
 * - Performance budget compliance with migration timing
 * - Zero-tolerance error handling with proper escalation
 *
 * @type {Array<{version: number, migrate: function(IDBDatabase, IDBTransaction, number): void}>}
 */
export const forensicLogMigrations = [
	{
		version: 1,
		migrate: (_db, _transaction, _oldVersion) => {
			// Version 1: Initial schema creation.
			// The 'audit_events' object store with 'id' as keyPath is created by ModernIndexedDB.
			// No additional changes are needed in this migration.
			//
			// Note: Schema creation operations are inherently synchronous in IndexedDB
			// and don't require orchestration wrapper patterns during migration execution.
			// The ModernIndexedDB class that calls these migrations handles orchestration.
		},
	},
	{
		version: 2,
		migrate: (_db, transaction, _oldVersion) => {
			// Version 2: Add essential indexes for querying audit events.
			// This migration improves performance for common audit scenarios.
			const store = transaction.objectStore("audit_events");

			// Mandate 2.4: Index 'type' for filtering events by category (e.g., 'SECURITY_CONTEXT_SET').
			// Performance optimization: Enables fast lookups by event type for forensic analysis.
			store.createIndex("type", "type", { unique: false });

			// Mandate 2.4: Index 'userContext.userId' to allow efficient querying of actions performed by a specific user.
			// This supports creating a complete audit trail for any individual.
			// Security compliance: Required for MAC policy enforcement and user activity tracking.
			store.createIndex("userId", "userContext.userId", {
				unique: false,
			});

			// Performance Pillar: Index 'timestamp' for fast time-based queries (e.g., "show all events from last 24 hours").
			// Forensic requirement: Enables temporal analysis of security events and system activity.
			store.createIndex("timestamp", "timestamp", { unique: false });
		},
	},
	{
		version: 3,
		migrate: (_db, transaction, _oldVersion) => {
			// Version 3: Add advanced forensic indexes for enterprise compliance.
			// Supports comprehensive audit trail analysis and security incident investigation.
			const store = transaction.objectStore("audit_events");

			// Enterprise Security: Index for classification-based queries
			// Enables MAC policy compliance and compartmentalized access to audit data
			store.createIndex("classification", "metadata.classification", {
				unique: false,
			});

			// Forensic Analysis: Compound index for component-operation pairs
			// Optimizes queries for specific system component activities
			store.createIndex(
				"component_operation",
				["metadata.component", "metadata.operation"],
				{
					unique: false,
				}
			);

			// Security Monitoring: Index for actor identification in security contexts
			// Supports rapid identification of actions by specific system actors
			store.createIndex("actorId", "metadata.actorId", {
				unique: false,
			});

			// Performance Optimization: Index for session-based forensic analysis
			// Enables correlation of events within specific user sessions
			store.createIndex("sessionId", "metadata.sessionId", {
				unique: false,
			});
		},
	},
];

/**
 * Metadata about migration capabilities and requirements.
 * Used by the migration orchestration system for planning and validation.
 */
export const migrationMetadata = {
	/**
	 * Current schema version supported by this migration set.
	 */
	currentVersion: 3,

	/**
	 * Minimum version that can be safely migrated to current.
	 * Earlier versions require full data reconstruction.
	 */
	minimumVersion: 1,

	/**
	 * Performance budget for each migration step (milliseconds).
	 * Used by orchestration system for timeout enforcement.
	 */
	performanceBudgets: {
		1: 50, // Initial schema creation
		2: 100, // Basic indexing
		3: 150, // Advanced enterprise indexes
	},

	/**
	 * Security classification requirements for migration data.
	 * Ensures proper MAC enforcement during migration operations.
	 */
	securityRequirements: {
		classification: "INTERNAL",
		compartments: ["FORENSIC_LOGS"],
		auditRequired: true,
	},

	/**
	 * Migration validation checksums for integrity verification.
	 * Used to ensure migration completeness and detect corruption.
	 */
	checksums: {
		1: "initial_schema_v1",
		2: "basic_indexes_v2",
		3: "enterprise_indexes_v3",
	},
};

export default forensicLogMigrations;
