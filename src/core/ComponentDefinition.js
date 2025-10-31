/**
 * @file Defines the ComponentDefinition and ComponentDefinitionRegistry classes for managing UI components, aligning with V8.0 parity.
 * @module ComponentDefinition
 * @description This file provides the data structures for defining reusable, entity-driven UI components and a registry for managing them.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles on composability.
 */

import RenderContext, { ContextMatcher } from "./RenderContext.js";

/**
 * @class ComponentDefinition
 * @classdesc Represents the definition of a reusable, adaptive UI component.
 */
export class ComponentDefinition {
	// V8.0 Parity: Use private fields for true encapsulation.
	/** @private @type {import('./HybridStateManager.js').default|null} */
	#stateManager = null;

	/**
	 * @class
	 * @param {string} id - The unique identifier for the component.
	 * @param {object} [config={}] - The configuration for the component.
	 * @param {import('./HybridStateManager.js').default} [config.stateManager] - The state manager instance.
	 */
	constructor(id, config = {}) {
		// V8.0 Parity: Store stateManager for context-aware operations.
		this.#stateManager = config.stateManager || null;

		/** @public @type {string} */
		this.id = id;
		/** @public @type {string} */
		this.name = config.name || id;
		/** @public @type {string} */
		this.description = config.description || "";
		/** @public @type {string} */
		this.category = config.category || "general";
		/** @public @type {string} */
		this.version = config.version || "1.0.0";

		/**
		 * @description Adaptation rules for different contexts.
		 * @public
		 * @type {object}
		 */
		this.adaptations = config.adaptations || {};
		/** @public @type {string} */
		this.defaultAdaptation = config.defaultAdaptation || "standard";

		/**
		 * @description Render methods for each adaptation.
		 * @public
		 * @type {object}
		 */
		this.render = config.render || {};

		/**
		 * @description Supported entity types this component can display.
		 * @public
		 * @type {Array<string>}
		 */
		this.supportedEntityTypes = config.supportedEntityTypes || [];

		/**
		 * @description Required permissions to render this component.
		 * @public
		 * @type {Array<string>}
		 */
		this.requiredPermissions = config.requiredPermissions || [];

		/**
		 * @description Dependencies (other components, libraries, etc.).
		 * @public
		 * @type {Array<string>}
		 */
		this.dependencies = config.dependencies || [];

		/**
		 * @description Configuration schema for this component.
		 * @public
		 * @type {object}
		 */
		this.configSchema = config.configSchema || {};

		/**
		 * @description Default configuration for this component.
		 * @public
		 * @type {object}
		 */
		this.defaultConfig = config.defaultConfig || {};

		/**
		 * @description Lifecycle hooks for this component.
		 * @public
		 * @type {object}
		 */
		this.hooks = config.hooks || {};

		/**
		 * @description Metadata for the plugin system.
		 * @public
		 * @type {object}
		 */
		this.metadata = config.metadata || {};
	}

	/**
	 * @function canRender
	 * @description Validates if this component can render the given entity types.
	 * @param {string|Array<string>} entityTypes - The entity types to check.
	 * @returns {boolean}
	 */
	canRender(entityTypes) {
		if (this.supportedEntityTypes.length === 0) return true; // Universal component

		const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
		return types.some(
			(type) =>
				this.supportedEntityTypes.includes(type) ||
				this.supportedEntityTypes.includes("*")
		);
	}

	/**
	 * @function hasPermissions
	 * @description Checks if a user has the required permissions to render this component.
	 * @param {Array<string>} [userPermissions=[]] - The permissions of the user.
	 * @returns {boolean}
	 * @deprecated since V8.0. Use `isRenderableFor(context)` for a more complete check.
	 */
	hasPermissions(userPermissions = []) {
		if (this.requiredPermissions.length === 0) return true;

		const securityManager = this.#stateManager?.managers?.securityManager;
		if (securityManager) {
			const subject = securityManager.getSubject();
			return this.requiredPermissions.every((perm) =>
				subject.permissions.includes(perm)
			);
		}

		return this.requiredPermissions.every((perm) =>
			userPermissions.includes(perm)
		);
	}

	/**
	 * @function getAdaptation
	 * @description Gets the best adaptation for a specific context.
	 * @param {RenderContext|object} context - The current rendering context.
	 * @returns {object} The selected adaptation.
	 */
	getAdaptation(context) {
		if (!this.#stateManager) {
			console.warn(
				`[ComponentDefinition] stateManager not available for component '${this.id}'. Adaptation selection may be inaccurate.`
			);
		}

		// Ensure context is a RenderContext instance
		const renderContext =
			context instanceof RenderContext
				? context
				: new RenderContext({
						stateManager: this.#stateManager,
						...context,
					});

		// Find best matching adaptation using shared ContextMatcher
		const bestMatch = ContextMatcher.findBestMatch(
			this.adaptations,
			renderContext
		);

		if (bestMatch) {
			return bestMatch;
		}

		// Return default adaptation
		return {
			name: this.defaultAdaptation,
			...this.adaptations[this.defaultAdaptation],
		};
	}

	/**
	 * @function validateConfig
	 * @description Validates a configuration object against the component's schema.
	 * @param {object} config - The configuration object to validate.
	 * @returns {{valid: boolean, errors: Array<string>}}
	 */
	validateConfig(config) {
		// Simple validation - could be enhanced with JSON Schema
		const errors = [];

		for (const [key, schema] of Object.entries(this.configSchema)) {
			if (schema.required && !(key in config)) {
				errors.push(`Missing required config: ${key}`);
			}

			if (key in config) {
				const value = config[key];

				if (schema.type && typeof value !== schema.type) {
					errors.push(`Config ${key} must be of type ${schema.type}`);
				}

				if (schema.enum && !schema.enum.includes(value)) {
					errors.push(
						`Config ${key} must be one of: ${schema.enum.join(", ")}`
					);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * @function mergeConfig
	 * @description Merges a user-provided configuration with the component's default configuration.
	 * @param {object} [userConfig={}] - The user-provided configuration.
	 * @returns {object} The merged configuration.
	 */
	mergeConfig(userConfig = {}) {
		return {
			...this.defaultConfig,
			...userConfig,
		};
	}

	/**
	 * @function toEntity
	 * @description Converts the component definition to an entity format for storage.
	 * @returns {object} The component definition as a storage entity.
	 */
	toEntity() {
		return {
			domain: "ui",
			type: "component_definition",
			data: {
				id: this.id,
				name: this.name,
				description: this.description,
				category: this.category,
				version: this.version,
				adaptations: this.adaptations,
				defaultAdaptation: this.defaultAdaptation,
				supportedEntityTypes: this.supportedEntityTypes,
				requiredPermissions: this.requiredPermissions,
				dependencies: this.dependencies,
				configSchema: this.configSchema,
				defaultConfig: this.defaultConfig,
				metadata: this.metadata,
			},
		};
	}

	/**
	 * @function fromEntity
	 * @description Creates a ComponentDefinition instance from a storage entity.
	 * @static
	 * @param {object} entity - The storage entity.
	 * @returns {ComponentDefinition}
	 */
	static fromEntity(entity) {
		if (entity.domain !== "ui" || entity.type !== "component_definition") {
			throw new Error("Invalid entity for ComponentDefinition");
		}

		return new ComponentDefinition(entity.data.id, entity.data);
	}

	/**
	 * @function clone
	 * @description Creates a clone of this component definition with optional modifications.
	 * @param {object} [modifications={}] - The modifications to apply to the cloned definition.
	 * @returns {ComponentDefinition}
	 */
	clone(modifications = {}) {
		const clonedConfig = {
			name: this.name,
			description: this.description,
			category: this.category,
			version: this.version,
			adaptations: { ...this.adaptations },
			defaultAdaptation: this.defaultAdaptation,
			render: { ...this.render },
			supportedEntityTypes: [...this.supportedEntityTypes],
			requiredPermissions: [...this.requiredPermissions],
			dependencies: [...this.dependencies],
			configSchema: { ...this.configSchema },
			defaultConfig: { ...this.defaultConfig },
			hooks: { ...this.hooks },
			metadata: { ...this.metadata },
			...modifications,
		};

		return new ComponentDefinition(`${this.id}_clone`, clonedConfig);
	}
}

/**
 * @class ComponentDefinitionRegistry
 * @classdesc Manages all component definitions in the system.
 */
export class ComponentDefinitionRegistry {
	/**
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		/** @public @type {import('./HybridStateManager.js').default} */
		this.stateManager = stateManager;
		// V8.0 Parity: Derive metricsRegistry from stateManager
		this.metrics =
			stateManager.metricsRegistry?.namespace("componentRegistry");
		/** @private @type {Map<string, ComponentDefinition>} */
		this.definitions = new Map();
		/** @private @type {Set<string>} */
		this.categories = new Set();
	}

	/**
	 * @function register
	 * @description Registers a component definition.
	 * @param {ComponentDefinition|object} definition - The component definition to register.
	 * @returns {ComponentDefinition}
	 */
	register(definition) {
		if (!(definition instanceof ComponentDefinition)) {
			// V8.0 Parity: Pass stateManager to the definition constructor.
			const config = { ...definition, stateManager: this.stateManager };
			definition = new ComponentDefinition(definition.id, config);
		}

		// Run before hooks
		this.stateManager?.emit?.("component:beforeRegister", { definition });

		// Register the definition
		this.definitions.set(definition.id, definition);
		this.categories.add(definition.category);
		this.metrics?.increment("registered");

		// Run after hooks
		this.stateManager?.emit?.("component:afterRegister", { definition });

		return definition;
	}

	/**
	 * @function get
	 * @description Gets a component definition by its ID.
	 * @param {string} id - The ID of the component.
	 * @returns {ComponentDefinition|undefined}
	 */
	get(id) {
		return this.definitions.get(id);
	}

	/**
	 * @function getByCategory
	 * @description Gets all component definitions in a specific category.
	 * @param {string} category - The category to search for.
	 * @returns {Array<ComponentDefinition>}
	 */
	getByCategory(category) {
		return Array.from(this.definitions.values()).filter(
			(def) => def.category === category
		);
	}

	/**
	 * @function getForEntityTypes
	 * @description Gets all component definitions that can render specific entity types.
	 * @param {string|Array<string>} entityTypes - The entity types to search for.
	 * @returns {Array<ComponentDefinition>}
	 */
	getForEntityTypes(entityTypes) {
		return Array.from(this.definitions.values()).filter((def) =>
			def.canRender(entityTypes)
		);
	}

	/**
	 * @function getForUser
	 * @description Gets all component definitions available to a user with specific permissions.
	 * @param {Array<string>} [userPermissions=[]] - The user's permissions.
	 * @returns {Array<ComponentDefinition>}
	 */
	getForUser(userPermissions = []) {
		const subject =
			this.stateManager?.managers?.securityManager?.getSubject();
		return Array.from(this.definitions.values()).filter((def) =>
			def.hasPermissions(subject?.permissions || userPermissions)
		);
	}

	/**
	 * @function search
	 * @description Searches for component definitions by name, description, or category.
	 * @param {string} query - The search query.
	 * @returns {Array<ComponentDefinition>}
	 */
	search(query) {
		const lowerQuery = query.toLowerCase();
		return Array.from(this.definitions.values()).filter(
			(def) =>
				def.name.toLowerCase().includes(lowerQuery) ||
				def.description.toLowerCase().includes(lowerQuery) ||
				def.category.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * @function unregister
	 * @description Unregisters a component definition.
	 * @param {string} id - The ID of the component to unregister.
	 * @returns {boolean} `true` if successful, `false` otherwise.
	 */
	unregister(id) {
		const definition = this.definitions.get(id);
		if (!definition) return false;

		this.stateManager?.emit?.("component:beforeUnregister", { definition });
		this.definitions.delete(id);
		this.stateManager?.emit?.("component:afterUnregister", {
			id,
			definition,
		});

		return true;
	}

	/**
	 * @function getCategories
	 * @description Gets all unique component categories.
	 * @returns {Array<string>}
	 */
	getCategories() {
		return Array.from(this.categories);
	}

	/**
	 * @function exportAsEntities
	 * @description Exports all registered component definitions as storage entities.
	 * @returns {Array<object>}
	 */
	exportAsEntities() {
		return Array.from(this.definitions.values()).map((def) =>
			def.toEntity()
		);
	}

	/**
	 * @function importFromEntities
	 * @description Imports and registers component definitions from storage entities.
	 * @param {Array<object>} entities - The storage entities to import.
	 * @returns {Array<ComponentDefinition>}
	 */
	importFromEntities(entities) {
		const imported = [];

		for (const entity of entities) {
			try {
				const definition = ComponentDefinition.fromEntity(entity);
				this.register(definition);
				imported.push(definition);
			} catch (error) {
				console.error("Failed to import component definition:", error);
			}
		}

		return imported;
	}

	/**
	 * @function getStats
	 * @description Gets statistics about the component registry.
	 * @returns {object}
	 */
	getStats() {
		const definitions = Array.from(this.definitions.values());

		const stats = {
			...this.metrics.getAllAsObject(),
			totalDefinitions: definitions.length,
			categoryCounts: Object.fromEntries(
				this.getCategories().map((cat) => [
					cat,
					definitions.filter((def) => def.category === cat).length,
				])
			),
			entityTypeSupport: this.getEntityTypeSupport(definitions),
			permissionRequirements: this.getPermissionRequirements(definitions),
		};

		return stats;
	}

	/**
	 * @function getEntityTypeSupport
	 * @description Gets statistics on entity type support across all components.
	 * @private
	 * @param {Array<ComponentDefinition>} definitions - The component definitions.
	 * @returns {object}
	 */
	getEntityTypeSupport(definitions) {
		const support = {};
		definitions.forEach((def) => {
			def.supportedEntityTypes.forEach((type) => {
				support[type] = (support[type] || 0) + 1;
			});
		});
		return support;
	}

	/**
	 * @function getPermissionRequirements
	 * @description Gets statistics on permission requirements across all components.
	 * @private
	 * @param {Array<ComponentDefinition>} definitions - The component definitions.
	 * @returns {object}
	 */
	getPermissionRequirements(definitions) {
		const requirements = {};
		definitions.forEach((def) => {
			def.requiredPermissions.forEach((perm) => {
				requirements[perm] = (requirements[perm] || 0) + 1;
			});
		});
		return requirements;
	}
}

export default ComponentDefinition;
