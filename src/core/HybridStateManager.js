/**
 * @file HybridStateManager.js
 * @description The central orchestrator for application state, combining in-memory client state
 * with a secure, dynamic, and persistent storage backend. It manages data, security,
 * and various subsystems like validation, auditing, and event processing.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

import { EventFlowEngine } from "@core/EventFlowEngine.js";
import { BoundedStack } from "@utils/BoundedStack.js";

import AdaptiveRenderer from "./AdaptiveRenderer.js";
import { LRUCache } from "../utils/LRUCache.js";
import { MetricsRegistry } from "../utils/MetricsRegistry.js";
import { NonRepudiation } from "./security/NonRepudiation.js";
import { StorageLoader } from "./storage/StorageLoader.js";

/**
 * @class HybridStateManager
 * @classdesc Manages the application's state by combining a fast, in-memory client state
 * with a robust, secure, and persistent offline storage layer. This version is specifically
 * designed to integrate with the `StorageLoader` for modern, modular storage capabilities.
 */
export class HybridStateManager {
	/**
	 * @param {object} [config={}] - The configuration object for the state manager.
	 */
	constructor(config = {}) {
		this.config = {
			maxUndoStackSize: config.maxUndoStackSize || 50,
			maxViewportItems: config.maxViewportItems || 200,
			performanceMode: config.performanceMode ?? false,
			offlineEnabled: config.offlineEnabled || true,
			embeddingEnabled: config.embeddingEnabled || true,

			// NEW: Dynamic storage configuration
			storageConfig: {
				demoMode: config.demoMode ?? true,
				auditLevel: config.auditLevel || "standard",
				strictValidation: config.strictValidation || false,
				enableSync: config.enableSync !== false,
				offlineMode: config.offlineMode ?? config.demoMode ?? false,
				realtimeSync: config.realtimeSync || false,
				...config.storageConfig,
			},

			...config,
		};

		// Client-side state (fast, immediate operations)
		/**
		 * The in-memory, client-side state for immediate operations and UI responsiveness.
		 * @type {object}
		 */
		this.clientState = {
			entities: new Map(),
			relationships: new Map(),
			undoStack: new BoundedStack(this.config.maxUndoStackSize),
			redoStack: new BoundedStack(this.config.maxUndoStackSize),
			pendingOperations: new BoundedStack(100),
			errors: [],
			searchIndex: new Map(),

			// UI state
			viewport: {
				entities: new Map(),
				maxItems: this.config.maxViewportItems,
				currentFilter: null,
			},

			selectedEntities: new Set(),
			dragState: null,

			// Performance cache
			cache: new LRUCache(1000, { ttl: 30 * 60 * 1000 }),
		};

		// NEW: Dynamic storage system
		/**
		 * Manages the connection to the persistent storage layer.
		 * @type {{loader: StorageLoader|null, instance: object|null, ready: boolean, config: object|null}}
		 */
		this.storage = {
			loader: null,
			instance: null,
			ready: false,
			config: null,
		};

		// NEW: Schema metadata from database
		/**
		 * Holds the database schema information once loaded.
		 * @type {{entities: Map<string, object>, fields: Map<string, object>, relationships: Map<string, object>, classifications: Set<string>, loaded: boolean}}
		 */
		this.schema = {
			entities: new Map(), // Entity type definitions from database
			fields: new Map(), // Field definitions from type_definitions table
			relationships: new Map(), // Relationship type definitions
			classifications: new Set(), // Security classifications
			loaded: false,
		};

		// Type definitions registry (now populated from database)
		/** @type {Map<string, object>} */
		this.typeDefinitions = new Map();

		// Plugin management (unchanged)
		this.plugins = {
			active: new Set(),
			loaded: new Map(),
			configs: new Map(),
			loadingStrategies: new Map(),
		};

		// Extension-based server capabilities (unchanged)
		this.serverCapabilities = {
			discovered: new Map(),
			endpoints: new Map(),
			routing: new Map(),
			fallbacks: new Map(),
			lastDiscovery: 0,
			discoveryInterval: 5 * 60 * 1000,
		};

		// State change listeners (unchanged)
		this.listeners = new Map();
		/** @private */
		this.viewModelBindings = new Map();

		// Component managers (enhanced with storage)
		/**
		 * A collection of specialized managers for different subsystems.
		 * @type {object}
		 * @property {object|null} offline - The offline storage manager.
		 * @property {import('./security/SecurityManager.js').default|null} securityManager - Manages user context and security policies.
		 * @property {import('./ForensicLogger.js').default|null} forensicLogger - Manages audit event logging.
		 */
		this.managers = {
			offline: null,
			sync: null,
			plugin: null,
			embedding: null,
			extension: null,
			validation: null, // NEW: Validation manager
			securityManager: null, // NEW: Security Manager
			forensicLogger: null, // NEW: Forensic Logger manager
		};

		// Enhanced metrics (unchanged structure)
		/**
		 * A collection of performance and usage metrics.
		 * @type {object}
		 */
		this.metrics = {
			operationLatencies: [],
			bundleSize: 0,
			embeddingCacheHitRate: 0,
			embeddingProcessingTimes: [],
			embeddingBatchEfficiency: 0,

			routing: {
				serverSuccessRate: 0,
				clientFallbackRate: 0,
				adaptiveDecisions: 0,
				extensionRoutingCount: 0,
			},

			rendering: {
				adaptiveRenderTimes: [],
				templateRenderTimes: [],
				averageRenderTime: 0,
				averageAdaptiveRenderTime: 0,
				componentCacheHitRate: 0,
			},

			memory: {
				entitiesCount: 0,
				relationshipsCount: 0,
				cacheSize: 0,
				undoStackSize: 0,
			},

			interaction: {
				commandsExecuted: 0,
				actionsTriggered: 0,
				conditionsEvaluated: 0,
			},

			// NEW: Storage metrics
			storage: {
				loadTime: 0,
				saveTime: 0,
				syncTime: 0,
				validationTime: 0,
				securityChecks: 0,
			},
		};

		// Vector Embedding State Management (unchanged)
		/**
		 * Manages state related to vector embeddings for AI/semantic features.
		 * @type {object}
		 */
		this.embeddingState = {
			contentCache: new LRUCache(1000, {
				ttl: 24 * 60 * 60 * 1000,
				onEvict: (key, value) => this.onEmbeddingCacheEvict(key, value),
			}),

			processingQueues: {
				immediate: [],
				batched: [],
				deferred: [],
			},

			batchConfig: {
				maxSizes: {
					entity_embeddings: 50,
					field_embeddings: 100,
					relationship_embeddings: 25,
				},
				timeouts: {
					immediate: 100,
					batched: 5000,
					deferred: 30000,
				},
			},

			modelConfig: {
				version: "text-embedding-3-small",
				dimensions: 1536,
				maxTokens: 8192,
			},

			isProcessing: false,
			lastBatchTime: 0,
			activeRequests: new Set(),

			routingDecisions: {
				clientCount: 0,
				serverCount: 0,
				reasonCounts: {
					all_cached: 0,
					immediate_priority: 0,
					large_volume: 0,
					offline: 0,
					rate_limited: 0,
					user_facing_cached: 0,
					default_server: 0,
					extension_routed: 0,
				},
				avgCacheHitRate: 0,
				avgContentVolume: 0,
			},
		};

		// Circuit breaker for server operations (unchanged)
		/**
		 * Implements a circuit breaker pattern to handle server operation failures gracefully.
		 * @type {object}
		 */
		this.circuitBreaker = {
			isOpen: false,
			failureCount: 0,
			lastFailureTime: 0,
			threshold: 5,
			timeout: 30000,
			halfOpenAttempts: 0,
			maxHalfOpenAttempts: 3,
		};

		// Initialize adaptive renderer (unchanged)
		/** @type {AdaptiveRenderer} */
		this.adaptiveRenderer = new AdaptiveRenderer(this);

		// Initialize metrics registry
		/** @type {MetricsRegistry} */
		this.metricsRegistry = new MetricsRegistry();

		// NEW: Non-repudiation signer
		/** @type {NonRepudiation} */
		this.signer = new NonRepudiation();

		/**
		 * A flag indicating if the state manager has been initialized.
		 * @type {boolean}
		 */
		this.initialized = false;
		/**
		 * An array of functions to call to unsubscribe from events.
		 * @type {Function[]}
		 * @private
		 */
		this.unsubscribeFunctions = [];
	}

	/**
	 * Initializes the HybridStateManager and its core subsystems, including storage and event processing.
	 * This is the main entry point after instantiation.
	 * @param {object} authContext - The authentication context of the current user.
	 * @param {string} authContext.userId - The user's unique identifier.
	 * @param {string} authContext.clearanceLevel - The user's security clearance level.
	 * @param {string[]} [authContext.compartments] - An array of security compartments the user has access to.
	 */
	async initialize(authContext) {
		if (this.initialized) return; // ✅ guard
		this.initialized = true;

		// (storage first to avoid event flow queries before DB exists)
		await this.initializeStorageSystem(authContext);
		await this.initializeEventSystem();

		// Initialize the Information Flow Tracker
		const { InformationFlowTracker } = await import(
			"@core/security/InformationFlowTracker.js"
		);
		this.informationFlow = new InformationFlowTracker((evt) =>
			this.emit("securityEvent", evt)
		);

		// Initialize the Cross-Domain Solution
		const { CrossDomainSolution } = await import("@core/security/cds.js");
		this.crossDomain = new CrossDomainSolution({
			emit: (evt) => this.emit("securityEvent", evt),
		});
		await this.loadManager("securityManager"); // Initialize security manager early
		await this.loadManager("forensicLogger"); // Ensure forensic logger is initialized early

		await this.loadDatabaseSchema();
	}

	/**
	 * Initializes the internal event system and subscribes to core events.
	 * @private
	 * @returns {Promise<EventFlowEngine>} The initialized event flow engine.
	 */
	async initializeEventSystem() {
		if (this.eventFlow?.initialized) return this.eventFlow;

		this.eventFlow = window.eventFlowEngine ?? new EventFlowEngine(this);
		this.eventFlow.initialized = true;

		// --- Core Event Subscriptions ---
		this.on("validationError", (data) => this.handleValidationError(data));
		this.on("syncCompleted", (data) => this.handleSyncCompleted(data));
		this.on("syncError", (data) => this.handleSyncError(data));
		this.on("accessDenied", (data) => this.handleAccessDenied(data));

		console.log("[HybridStateManager] Event system initialized");
		return this.eventFlow;
	}

	// --- Validation Layer ---
	/**
	 * Handles validation error events.
	 * @private
	 * @param {object} data - The error data payload.
	 */
	handleValidationError(data) {
		this.clientState.errors.push(data);
		this.metricsRegistry.increment("validation_errors");
		this.recordAuditEvent("VALIDATION_ERROR", data);
	}

	// --- Sync Layer ---
	/**
	 * Handles successful sync completion events.
	 * @private
	 * @param {object} data - The sync completion data.
	 */
	handleSyncCompleted(data) {
		this.metricsRegistry.increment("sync_completed");
		this.clientState.lastSync = data.timestamp;
		this.recordAuditEvent("SYNC_COMPLETED", data);
	}

	/**
	 * Handles sync error events.
	 * @private
	 * @param {object} data - The sync error data.
	 */
	handleSyncError(data) {
		this.metricsRegistry.increment("sync_errors");
		this.clientState.lastSyncError = data.timestamp;
		this.recordAuditEvent("SYNC_ERROR", data);
	}

	// --- Security Layer ---
	/**
	 * Handles access denied events.
	 * @private
	 * @param {object} data - The access denied data.
	 */
	handleAccessDenied(data) {
		this.metricsRegistry.increment("access_denied");
		this.recordAuditEvent("ACCESS_DENIED", data);
	}

	/**
	 * Records an audit event, persisting it locally in offline/demo mode.
	 * @param {string} type - The type of the audit event.
	 * @param {object} payload - The data associated with the event.
	 * @returns {Promise<void>}
	 */
	async recordAuditEvent(type, payload) {
		if (!this.managers.forensicLogger || !this.managers.securityManager) {
			console.warn(
				"[HybridStateManager] ForensicLogger not initialized, audit event not recorded:",
				type,
				payload
			);
			return;
		}

		try {
			const userId = this.managers.securityManager.userId || "system";
			const label = {
				entityId: payload?.entity?.id || payload?.resource,
				entityType: payload?.entity?.type,
			};

			// Get the user's clearance at the time of the event for the audit record.
			const clearance = this.managers.securityManager.getSubject();
			const serializableClearance = {
				level: clearance.level,
				compartments: Array.from(clearance.compartments),
			};
			const signature = await this.signer.signAction({
				userId,
				action: type,
				label,
			});

			const event = {
				id: crypto.randomUUID(),
				type,
				timestamp: new Date().toISOString(),
				payload,
				clearance: serializableClearance, // Add clearance to the event
				...signature,
			};
			await this.managers.forensicLogger.logEvent(event);
			console.log(`[HybridStateManager][Audit] ${type}`, payload);
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to log audit event:",
				error
			);
		}
	}

	/**
	 * Initializes the dynamic storage system by creating and configuring the `StorageLoader`.
	 * @private
	 * @param {object} authContext - The user's authentication context.
	 * @returns {Promise<object>} The initialized storage object.
	 */
	async initializeStorageSystem(authContext) {
		if (this.storage.ready) {
			return this.storage;
		}

		const startTime = performance.now();

		// Ensure SecurityManager is loaded and set the context
		const securityManager = await this.loadManager("securityManager");
		if (authContext?.userId && authContext?.clearanceLevel) {
			securityManager.setUserContext(
				authContext.userId,
				authContext.clearanceLevel,
				authContext.compartments
			);
		}

		// Create storage loader (pass mac + demoMode explicitly)
		this.storage.loader = new StorageLoader({
			baseURL: "/src/core/storage/modules/", // ensure absolute path works in dev
			demoMode: Boolean(this.config.demoMode), // <— top-level
			mac: securityManager.mac, // <— pass MAC engine from the SecurityManager
		});

		await this.storage.loader.init();

		// Create storage instance with user context + demo flag
		this.storage.instance = await this.storage.loader.createStorage(
			authContext,
			{
				demoMode: Boolean(this.config.demoMode),
				enableSync: this.config?.sync?.enableSync === true,
				realtimeSync: this.config?.sync?.realtime === true,
			}
		);

		this.storage.ready = true;
	}

	/**
	 * Determines the correct object store for a given entity.
	 * This is central to routing standard vs. polyinstantiated entities.
	 * @param {object|null} entity - The entity to inspect.
	 * @returns {'objects'|'objects_polyinstantiated'} The name of the object store.
	 * @private
	 */
	storeFor(entity) {
		if (!entity) return "objects";
		// Polyinstantiated entities are identified by these specific fields.
		if (entity.logical_id && entity.classification_level) {
			return "objects_polyinstantiated";
		}
		return "objects"; // Default fallback for standard entities.
	}

	/**
	 * Loads the database schema definition. In a real application, this would fetch from the database.
	 * Here, it's simulated with a hardcoded structure.
	 * @private
	 */
	async loadDatabaseSchema() {
		try {
			// In a real implementation, this would query the database
			// For now, we'll simulate with the schema structure from nodus.sql

			// Load entity types from objects table structure
			this.schema.entities.set("objects", {
				tableName: "objects",
				primaryKey: "id",
				fields: {
					id: { type: "uuid", required: true },
					organization_id: { type: "uuid", required: true },
					entity_type: { type: "text", required: true },
					display_name: { type: "text" },
					description: { type: "text" },
					content: { type: "jsonb" },
					status: { type: "text", default: "active" },
					priority: { type: "integer", default: 0 },
					tags: { type: "text[]", default: "{}" },
					classification: {
						type: "security_classification",
						default: "restricted",
					},
					compartment_markings: { type: "text[]", default: "{}" },
					created_at: { type: "timestamptz", default: "now()" },
					updated_at: { type: "timestamptz", default: "now()" },
					created_by: { type: "uuid", required: true },
					updated_by: { type: "uuid", required: true },
					version: { type: "integer", default: 1 },
					sync_state: { type: "sync_state", default: "local_dirty" },
					last_synced: { type: "timestamptz" },
				},
			});

			// Load events table structure
			this.schema.entities.set("events", {
				tableName: "events",
				primaryKey: "id",
				fields: {
					id: { type: "uuid", required: true },
					organization_id: { type: "uuid", required: true },
					event_type: { type: "text", required: true },
					source_entity_id: { type: "uuid" },
					target_entity_id: { type: "uuid" },
					event_data: { type: "jsonb" },
					classification: {
						type: "security_classification",
						default: "restricted",
					},
					compartment_markings: { type: "text[]", default: "{}" },
					created_at: { type: "timestamptz", default: "now()" },
					created_by: { type: "uuid", required: true },
				},
			});

			// Load relationships table structure
			this.schema.entities.set("links", {
				tableName: "links",
				primaryKey: "id",
				fields: {
					id: { type: "uuid", required: true },
					org_id: { type: "uuid", required: true },
					source_id: { type: "uuid", required: true },
					target_id: { type: "uuid", required: true },
					relationship_type: { type: "text", required: true },
					metadata: { type: "jsonb" },
					classification: {
						type: "security_classification",
						default: "restricted",
					},
					compartment_markings: { type: "text[]", default: "{}" },
					created_at: { type: "timestamptz", default: "now()" },
					created_by: { type: "uuid", required: true },
				},
			});

			// Load security classifications
			this.schema.classifications = new Set([
				"public",
				"internal",
				"restricted",
				"confidential",
				"secret",
				"top_secret",
				"nato_restricted",
				"nato_confidential",
				"nato_secret",
				"cosmic_top_secret",
			]);

			this.schema.loaded = true;
			console.log("[HybridStateManager] Database schema loaded");
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to load database schema:",
				error
			);
			throw error;
		}
	}

	/**
	 * Loads UI-ready type definitions from the raw database schema.
	 * @private
	 * @returns {Promise<void>}
	 */
	async loadTypeDefinitionsFromSchema() {
		try {
			// Create type definitions based on database schema
			for (const [
				entityType,
				schemaInfo,
			] of this.schema.entities.entries()) {
				const typeDef = {
					id: entityType,
					name:
						entityType.charAt(0).toUpperCase() +
						entityType.slice(1),
					table: schemaInfo.tableName,
					fields: this.convertSchemaToFields(schemaInfo.fields),
					actions: this.getDefaultActionsForType(entityType),
					security: {
						classificationField: "classification",
						compartmentField: "compartment_markings",
						ownerField: "created_by",
					},
				};

				this.typeDefinitions.set(entityType, typeDef);
			}

			console.log(
				`[HybridStateManager] Loaded ${this.typeDefinitions.size} type definitions from schema`
			);
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to load type definitions:",
				error
			);
			throw error;
		}
	}

	/**
	 * Converts raw database schema field definitions into a format suitable for UI rendering.
	 * @private
	 * @param {object} schemaFields - The raw field definitions from the schema.
	 * @returns {object[]} An array of UI-ready field definitions.
	 */
	convertSchemaToFields(schemaFields) {
		const uiFields = [];

		for (const [fieldName, fieldInfo] of Object.entries(schemaFields)) {
			// Skip internal system fields from UI
			if (
				[
					"id",
					"organization_id",
					"created_at",
					"updated_at",
					"created_by",
					"updated_by",
					"version",
				].includes(fieldName)
			) {
				continue;
			}

			const uiField = {
				name: fieldName,
				label: this.formatFieldLabel(fieldName),
				type: this.mapDatabaseTypeToUI(fieldInfo.type),
				required: fieldInfo.required || false,
				default: fieldInfo.default,
				validation: this.getFieldValidation(fieldName, fieldInfo),
			};

			// Special handling for security fields
			if (fieldName === "classification") {
				uiField.type = "select";
				uiField.options = Array.from(this.schema.classifications);
				uiField.security = true;
			}

			if (fieldName === "compartment_markings") {
				uiField.type = "tags";
				uiField.security = true;
			}

			uiFields.push(uiField);
		}

		return uiFields;
	}

	/**
	 * Maps a database data type to a corresponding UI component type.
	 * @private
	 * @param {string} dbType - The database type string.
	 * @returns {string} The corresponding UI field type.
	 */
	mapDatabaseTypeToUI(dbType) {
		const typeMap = {
			text: "text",
			varchar: "text",
			uuid: "hidden",
			integer: "number",
			boolean: "checkbox",
			jsonb: "json",
			"text[]": "tags",
			timestamptz: "datetime",
			security_classification: "select",
			sync_state: "hidden",
		};

		return typeMap[dbType] || "text";
	}

	/**
	 * Formats a snake_case field name into a human-readable "Title Case" label.
	 * @private
	 * @param {string} fieldName - The field name to format.
	 * @returns {string} The formatted label.
	 */
	formatFieldLabel(fieldName) {
		return fieldName
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	/**
	 * Generates basic validation rules for a field based on its schema definition.
	 * @private
	 * @param {string} fieldName - The name of the field.
	 * @param {object} fieldInfo - The schema information for the field.
	 * @returns {object[]} An array of validation rule objects.
	 */
	getFieldValidation(fieldName, fieldInfo) {
		const validation = [];

		if (fieldInfo.required) {
			validation.push({
				type: "required",
				message: `${this.formatFieldLabel(fieldName)} is required`,
			});
		}

		if (fieldInfo.type === "text" && fieldName.includes("email")) {
			validation.push({
				type: "email",
				message: "Must be a valid email address",
			});
		}

		if (fieldName === "classification") {
			validation.push({
				type: "security_classification",
				message: "Must be a valid security classification",
			});
		}

		return validation;
	}

	/**
	 * Gets a default set of UI actions for a given entity type.
	 * @private
	 * @param {string} entityType - The type of the entity.
	 * @returns {object[]} An array of action definition objects.
	 */
	getDefaultActionsForType(entityType) {
		const baseActions = [
			{ id: "view", name: "View", icon: "eye", category: "essential" },
			{ id: "edit", name: "Edit", icon: "edit", category: "essential" },
			{
				id: "delete",
				name: "Delete",
				icon: "trash",
				category: "common",
				confirmation: true,
			},
		];

		const typeSpecificActions = {
			objects: [
				{
					id: "duplicate",
					name: "Duplicate",
					icon: "copy",
					category: "common",
				},
				{
					id: "export",
					name: "Export",
					icon: "download",
					category: "advanced",
				},
			],
			events: [
				{
					id: "replay",
					name: "Replay Event",
					icon: "refresh",
					category: "advanced",
				},
			],
			links: [
				{
					id: "visualize",
					name: "Visualize",
					icon: "network",
					category: "common",
				},
			],
		};

		return [...baseActions, ...(typeSpecificActions[entityType] || [])];
	}

	/**
	 * Saves an entity to the appropriate persistent store, handling polyinstantiation and security.
	 * @param {object} entity - The entity object to save.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the saved item.
	 * @throws {Error} If the storage system is not ready or if the save operation fails.
	 */
	async saveEntity(entity) {
		try {
			if (!this.storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// 1. Determine the correct store
			const store = this.storeFor(entity);

			// 2. Ensure logical_id is present for polyinstantiated types
			if (store === "objects_polyinstantiated" && !entity.logical_id) {
				entity.logical_id = crypto.randomUUID();
			}

			// 3. Add/update in client state
			this.clientState.entities.set(entity.id, entity);

			// 4. Save through the secure storage instance, which handles MAC, crypto, etc.
			const result = await this.storage.instance.put(store, entity);

			// 5. Emit event
			this.emit("entitySaved", {
				store,
				id: entity.id || entity.logical_id,
				entity,
			});

			return result;
		} catch (error) {
			console.error("[HybridStateManager] Failed to save entity:", error);
			this.emit("entitySaveFailed", { entity, error });
			throw error;
		}
	}

	/**
	 * Loads a single logical entity, correctly merging polyinstantiated versions if they exist and are readable.
	 * @param {string} logicalId - The logical ID of the entity to load.
	 * @returns {Promise<object|null>} A promise that resolves with the merged entity, or null if not found.
	 * @throws {Error} If the storage system is not ready or if the load operation fails.
	 */
	async loadEntity(logicalId) {
		try {
			if (!this.storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// Attempt to load polyinstantiated versions first.
			// The `get` method on the storage instance will handle merging readable rows.
			const poly = await this.storage.instance.get(
				"objects_polyinstantiated",
				logicalId
			);
			if (poly) return poly;

			// Fallback to the standard objects store if no polyinstantiated version is found.
			return await this.storage.instance.get("objects", logicalId);
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to load entity ${logicalId}:`,
				error
			);
			this.emit("entityLoadFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Loads multiple entities from storage.
	 * @param {object} [options={}] - Options to filter the entities to load. (Currently a placeholder).
	 * @returns {Promise<object[]>} A promise that resolves with an array of loaded entities.
	 * @throws {Error} If the storage system is not ready or if the load operation fails.
	 */
	async loadEntities(options = {}) {
		const startTime = performance.now();

		try {
			if (!this.storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// This is a placeholder; a real implementation would need more specific options.
			// For now, we assume it loads all from the 'objects' store.
			const result = await this.storage.instance.getAll("objects");

			result.forEach((entity) =>
				this.clientState.entities.set(entity.id, entity)
			);

			this.metrics.storage.loadTime = performance.now() - startTime;
			this.emit("entitiesLoaded", { result });

			return result;
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to load entities:",
				error
			);
			this.emit("entitiesLoadFailed", { error });
			throw error;
		}
	}

	/**
	 * Deletes an entity and all its polyinstantiated versions that the user has permission to affect.
	 * @param {string} logicalId The logical ID of the entity to delete.
	 * @returns {Promise<void>}
	 * @throws {Error} If the storage system is not ready or if the delete operation fails.
	 */
	async deleteEntity(logicalId) {
		try {
			if (!this.storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// 1. Remove from client state first for immediate UI feedback.
			this.clientState.entities.delete(logicalId);

			// 2. Attempt to delete from the polyinstantiated store.
			// The storage's delete method will handle finding all readable instances.
			await this.storage.instance.delete(
				"objects_polyinstantiated",
				logicalId
			);

			// 3. Attempt to delete from the standard store as a fallback.
			// If the entity was only in the standard store, this will catch it.
			await this.storage.instance.delete("objects", logicalId);

			// 4. Emit event
			this.emit("entityDeleted", {
				id: logicalId,
			});
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to delete entity ${logicalId}:`,
				error
			);
			this.emit("entityDeleteFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Retrieves the version history of a polyinstantiated entity.
	 * This allows for auditing and viewing how an entity has changed over time
	 * across different classification levels that the user can access.
	 * @param {string} logicalId The logical ID of the entity.
	 * @returns {Promise<object[]>} A promise that resolves to an array of historical entity versions.
	 * @throws {Error} If the storage system is not ready or if the history retrieval fails.
	 */
	async getEntityHistory(logicalId) {
		try {
			if (!this.storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// Delegate to the storage instance, which knows how to handle this.
			const history = await this.storage.instance.getHistory(
				"objects_polyinstantiated",
				logicalId
			);

			this.emit("entityHistoryLoaded", { id: logicalId, history });
			return history;
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to get history for entity ${logicalId}:`,
				error
			);
			this.emit("entityHistoryFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Initiates a synchronization operation with a remote server.
	 * @param {object} [options={}] - Options for the sync operation.
	 * @returns {Promise<object>} A promise that resolves with the result of the sync operation.
	 * @throws {Error} If the sync operation fails.
	 */
	async syncEntities(options = {}) {
		const startTime = performance.now();

		try {
			if (!this.storage.ready || !this.storage.instance.sync) {
				console.warn("[HybridStateManager] Sync not available");
				return { synced: 0, skipped: 0 };
			}

			const result = await this.storage.instance.sync(options);

			this.metrics.storage.syncTime = performance.now() - startTime;
			this.emit("entitiesSynced", { result });

			return result;
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to sync entities:",
				error
			);
			this.emit("entitiesSyncFailed", { error });
			throw error;
		}
	}

	/**
	 * Sets the security context for the current user.
	 * @param {string} userId - The user's unique identifier.
	 * @param {string} clearanceLevel - The user's security clearance level.
	 * @param {string[]} [compartments=[]] - An array of security compartments the user has access to.
	 * @param {number} [ttl=14400000] - The time-to-live for this context in milliseconds.
	 * @returns {Promise<void>}
	 * @throws {Error} If the SecurityManager is not initialized.
	 */
	async setUserSecurityContext(
		userId,
		clearanceLevel,
		compartments = [],
		ttl = 4 * 3600000
	) {
		try {
			const securityManager = this.managers.securityManager;
			if (!securityManager) {
				throw new Error("SecurityManager not initialized.");
			}
			// Delegate to the SecurityManager
			securityManager.setUserContext(
				userId,
				clearanceLevel,
				compartments,
				ttl
			);

			this.emit("securityContextSet", {
				userId,
				clearanceLevel,
				compartments,
			});
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to set security context:",
				error
			);
			throw error;
		}
	}

	/**
	 * Gets the raw database schema for a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object|undefined} The schema object, or undefined if not found.
	 */
	getEntitySchema(entityType) {
		return this.schema.entities.get(entityType);
	}

	/**
	 * Gets the UI-ready type definition for a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object|undefined} The type definition object, or undefined if not found.
	 */
	getTypeDefinition(entityType) {
		return this.typeDefinitions.get(entityType);
	}

	/**
	 * Gets a list of all available entity types.
	 * @returns {string[]} An array of entity type names.
	 */
	getAvailableEntityTypes() {
		return Array.from(this.typeDefinitions.keys());
	}

	/**
	 * Gets a list of all available security classifications.
	 * @returns {string[]} An array of classification names.
	 */
	getSecurityClassifications() {
		return Array.from(this.schema.classifications);
	}

	/**
	 * Retrieves performance and state metrics related to the storage subsystem.
	 * @returns {object} An object containing storage metrics.
	 */
	getStorageMetrics() {
		return {
			...this.metrics.storage,
			storageReady: this.storage.ready,
			loadedModules: this.storage.instance?.modules || [],
			schemaLoaded: this.schema.loaded,
			typeDefinitions: this.typeDefinitions.size,
		};
	}

	/**
	 * Registers a listener function for a specific event type.
	 * @param {string} eventName - The name of the event to listen for.
	 * @param {Function} listener - The callback function to execute.
	 * @returns {Function} An unsubscribe function to remove the listener.
	 */
	on(eventName, listener) {
		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, []);
		}
		this.listeners.get(eventName).push(listener);

		const unsubscribe = () => {
			const listeners = this.listeners.get(eventName);
			if (listeners) {
				const index = listeners.indexOf(listener);
				if (index > -1) {
					listeners.splice(index, 1);
				}
			}
		};
		this.unsubscribeFunctions.push(unsubscribe);
		return unsubscribe;
	}

	/**
	 * Emits an event to all registered listeners for that event type.
	 * @param {string} eventName - The name of the event to emit.
	 * @param {object} [payload] - The data to pass to the listeners.
	 * @returns {void}
	 */
	emit(eventName, payload) {
		const listeners = this.listeners.get(eventName);
		if (listeners) {
			listeners.forEach((listener) => {
				try {
					listener(payload);
				} catch (error) {
					console.error(
						`Error in listener for event ${eventName}:`,
						error
					);
				}
			});
		}

		// Optional bridge to global engine if available
		if (this.config.bridgeToGlobalEngine && window?.eventFlowEngine?.emit) {
			try {
				window.eventFlowEngine.emit(eventName, payload);
			} catch (err) {
				console.warn(
					`[HybridStateManager] Bridge emit failed for ${eventName}:`,
					err
				);
			}
		}
	}

	/**
	 * Gracefully shuts down the state manager and all its sub-modules.
	 * This method cleans up event listeners, stops timers, and closes database connections.
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		console.log("[HybridStateManager] Starting cleanup...");

		// 1. Unsubscribe all internal event listeners
		this.unsubscribeFunctions.forEach((unsubscribe) => {
			try {
				unsubscribe?.();
			} catch (error) {
				console.warn("[HybridStateManager] Unsubscribe failed:", error);
			}
		});
		this.unsubscribeFunctions.length = 0;

		// 2. Clean up all managers that have a cleanup method
		for (const managerName in this.managers) {
			const manager = this.managers[managerName];
			if (manager && typeof manager.cleanup === "function") {
				try {
					await manager.cleanup();
				} catch (error) {
					console.error(
						`[HybridStateManager] Error cleaning up manager '${managerName}':`,
						error
					);
				}
			}
		}

		this.initialized = false;
		console.log("[HybridStateManager] Cleanup complete.");
	}

	// ... Rest of the existing methods remain unchanged ...
	// (executeAction, mapActionToCommand, executeCommand, etc.)

	/**
	 * Dynamically loads and initializes a manager module by name.
	 * @param {string} managerName - The name of the manager to load (e.g., 'validation', 'securityManager').
	 * @returns {Promise<object>} A promise that resolves with the initialized manager instance.
	 * @throws {Error} If the manager is unknown or fails to load.
	 */
	async loadManager(managerName) {
		if (this.managers[managerName]) return this.managers[managerName];

		try {
			let manager;
			switch (managerName) {
				case "offline": {
					break;
				}
				case "embedding": {
					const { EmbeddingManager } = await import(
						"./../state/EmbeddingManager.js"
					);
					manager = new EmbeddingManager(this);
					break;
				}
				case "extension": {
					const { ExtensionManager } = await import(
						"./ExtensionManager.js"
					);
					manager = new ExtensionManager(this);
					break;
				}
				case "validation":
					// Directly use the validation module from the storage instance.
					// ModularOfflineStorage will have already instantiated and initialized it.
					if (!this.storage.instance?.validation) {
						throw new Error(
							"Validation module not available in storage instance."
						);
					}
					manager = this.storage.instance.validation;
					break;
				case "forensicLogger":
					// Dynamically import and instantiate ForensicLogger
					const { ForensicLogger } = await import(
						"./ForensicLogger.js"
					);
					manager = new ForensicLogger(
						this.config.forensicLoggerConfig
					);
					break;
				case "securityManager":
					// Dynamically import and instantiate SecurityManager
					const { SecurityManager } = await import(
						"./security/SecurityManager.js"
					);
					manager = new SecurityManager();
					manager.bindStateManager(this);
					break;
				default:
					throw new Error(`Unknown manager: ${managerName}`);
			}

			this.managers[managerName] = manager;
			await manager.initialize?.();
			return manager;
		} catch (error) {
			console.error(`Failed to load manager ${managerName}:`, error);
			throw error;
		}
	}

	// All other existing methods remain the same...
	// (executeAction, getEntity, getEntitiesByType, recordOperation, etc.)
}

export default HybridStateManager;
