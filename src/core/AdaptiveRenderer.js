/**
 * @file Contains the AdaptiveRenderer class for context-driven component rendering.
 * @module AdaptiveRenderer
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles on composability.
 */

import RenderContext, { ContextMatcher } from "./RenderContext.js";

/**
 * @class AdaptiveRenderer
 * @classdesc A renderer that selects the most appropriate component representation (adaptation) based on the current rendering context.
 * This allows components to change their appearance and functionality depending on factors like device, user permissions, or application state.
 */
export class AdaptiveRenderer {
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./ComponentDefinition.js').ComponentDefinitionRegistry|null} */
	#componentRegistry = null;
	/** @private @type {import('./BuildingBlockRenderer.js').BuildingBlockRenderer|null} */
	#buildingBlockRenderer = null;
	/** @private @type {import('../utils/LRUCache.js').LRUCache|null} */
	#adaptationCache = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('./ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/**
	 * @class
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		/** @private @type {import('./HybridStateManager.js').default} */
		this.#stateManager = stateManager;
		// Derive dependencies from stateManager in the constructor.
		this.#componentRegistry = this.#stateManager.managers.componentRegistry;
		this.#buildingBlockRenderer =
			this.#stateManager.managers.buildingBlockRenderer;
		this.#adaptationCache =
			this.#stateManager.managers.cacheManager?.getCache("adaptations");
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("adaptiveRenderer");
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#forensicLogger?.logAuditEvent("SYSTEM_INITIALIZATION", {
			component: "AdaptiveRenderer",
			status: "initialized",
		});

		// V8.0 Parity: Mandate 4.3 - Apply performance measurement decorator to the render method.
		// Note: The decorator is implemented as a higher-order function wrapper for now.
		this.render = this.#metrics.measure("render", {
			component: "AdaptiveRenderer",
		})(this.render.bind(this));
	}

	/**
	 * @function render
	 * @description The main entry point for rendering a component. It selects the best adaptation based on the context and renders it.
	 * @param {string} componentId - The ID of the component to render.
	 * @param {RenderContext|object} context - The current rendering context.
	 * @param {object} [data={}] - Additional data to pass to the render method.
	 * @returns {HTMLElement|object} The rendered component or a fallback element.
	 */
	render(componentId, context, data = {}) {
		return this.#errorHelpers?.tryOr(
			() => {
				const component = this.#getComponent(componentId);
				if (!component) {
					this.#forensicLogger?.logAuditEvent("RENDER_FAILURE", {
						reason: "Component not found",
						componentId,
					});
					return this.#renderFallback(componentId, context);
				}

				// Ensure context is a RenderContext instance and extend it with render-specific data.
				const renderContext = (
					context instanceof RenderContext
						? context
						: new RenderContext({
								stateManager: this.#stateManager,
								...context,
							})
				).extend({
					componentId,
					data, // Merge in any direct data
				});

				// Select appropriate adaptation based on context
				const adaptation = this.#selectAdaptation(
					component,
					renderContext
				);

				// Render with selected adaptation
				const result = this.#renderAdaptation(
					component,
					adaptation,
					renderContext
				);

				return result;
			},
			(error) => this.#renderError(componentId, error, context)
		);
	}

	/**
	 * Retrieves a component definition from the central registry.
	 * @private
	 * @param {string} componentId - The ID of the component to retrieve.
	 * @returns {import('./ComponentDefinition.js').ComponentDefinition|undefined} The component definition.
	 */
	#getComponent(componentId) {
		return this.#componentRegistry?.get(componentId);
	}

	/**
	 * @description Selects the best adaptation for a component based on the current context.
	 * @private
	 * @param {object} component - The component definition.
	 * @param {RenderContext} context - The current rendering context.
	 * @returns {object} The selected adaptation.
	 */
	#selectAdaptation(component, context) {
		// Create a stable cache key from relevant context properties
		const cacheKey = `${component.id}:${context.purpose}:${context.intent}:${context.getCurrentBreakpoint()}:${context.userRole}`;

		// Check cache first
		if (this.#adaptationCache?.has(cacheKey)) {
			this.#metrics?.increment("cacheHits");
			return { ...this.#adaptationCache.get(cacheKey), cached: true };
		}

		// Find best matching adaptation using shared ContextMatcher
		const bestMatch = ContextMatcher.findBestMatch(
			component.adaptations,
			context
		);

		if (bestMatch) {
			const selectedAdaptation = {
				name: bestMatch.name,
				...bestMatch,
				cached: false,
			};

			// Cache the selection
			this.#adaptationCache?.set(cacheKey, selectedAdaptation);
			return selectedAdaptation;
		}

		// Fallback to default
		const defaultAdaptation = {
			name: component.defaultAdaptation,
			...component.adaptations[component.defaultAdaptation],
			cached: false,
		};

		this.#adaptationCache?.set(cacheKey, defaultAdaptation);
		return defaultAdaptation;
	}

	/**
	 * @description Renders a component using the selected adaptation.
	 * @private
	 * @param {object} component - The component definition.
	 * @param {object} adaptation - The selected adaptation.
	 * @param {RenderContext} context - The current rendering context.
	 * @returns {HTMLElement|object|null} The rendered component.
	 */
	#renderAdaptation(component, adaptation, context) {
		// V8.0 Parity: Delegate all rendering to the BuildingBlockRenderer.
		if (!this.#buildingBlockRenderer) {
			this.#forensicLogger?.logAuditEvent("RENDER_FAILURE", {
				reason: "BuildingBlockRenderer not available",
				componentId: component.id,
			});
			return this.#renderFallback(
				component.id,
				context,
				"Renderer not available"
			);
		}

		// Extend the context with adaptation-specific info for the render function.
		const finalRenderContext = context.extend({
			adaptationName: adaptation.name,
			// Merge component's default config with the adaptation's render config.
			config: {
				...component.defaultConfig,
				...(adaptation.render || {}),
			},
		});

		// The `composition` is the render definition from the adaptation.
		// It can be a block ID (string), a sequence (array), or a layout (object).
		const composition =
			component.render[adaptation.name] || component.render.default;

		if (!composition) {
			this.#forensicLogger?.logAuditEvent("RENDER_FAILURE", {
				reason: `No render definition for adaptation '${adaptation.name}'`,
				componentId: component.id,
			});
			return this.#renderFallback(component.id, context);
		}

		return this.#buildingBlockRenderer.render(
			composition,
			finalRenderContext
		);
	}

	/**
	 * @description Renders a fallback UI for when a component is not found.
	 * @private
	 * @param {string} componentId - The ID of the missing component.
	 * @param {RenderContext} context - The current rendering context.
	 * @param {string} [reason="Component not found"] - The reason for the fallback.
	 * @returns {HTMLElement} The fallback element.
	 */
	#renderFallback(componentId, context, reason = "Component not found") {
		const fallback = document.createElement("div");
		fallback.className = "adaptive-renderer-fallback";
		fallback.style.cssText =
			"padding: 8px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px; color: #d46b08; font-size: 12px;";

		const content = document.createElement("div");
		content.className = "fallback-content";

		const strong = document.createElement("strong");
		strong.textContent = reason;

		const p1 = document.createElement("p");
		p1.textContent = `Component: ${componentId}`;

		content.append(strong, p1);
		fallback.appendChild(content);
		return fallback;
	}

	/**
	 * @description Renders an error UI when a component fails to render.
	 * @private
	 * @param {string} componentId - The ID of the component that failed.
	 * @param {Error} error - The error that occurred.
	 * @param {RenderContext} context - The current rendering context.
	 * @returns {HTMLElement|null} The error element.
	 */
	#renderError(componentId, error, context) {
		const errorEl = document.createElement("div");
		errorEl.className = "adaptive-renderer-error";
		errorEl.style.cssText =
			"padding: 8px; background: #fff1f0; border: 1px solid #ffccc7; border-radius: 4px; color: #cf1322; font-size: 12px;";

		const content = document.createElement("div");
		content.className = "error-content";

		const strong = document.createElement("strong");
		strong.textContent = "Render Error";

		const p1 = document.createElement("p");
		p1.textContent = `Component: ${componentId}`;
		const p2 = document.createElement("p");
		p2.textContent = `Error: ${error.message}`;
		content.append(strong, p1, p2);
		errorEl.appendChild(content);
		return errorEl;
	}

	/**
	 * @function getMetrics
	 * @description Retrieves the current performance metrics.
	 * @public
	 * @returns {object} The performance metrics.
	 */
	getMetrics() {
		return {
			...(this.#metrics?.getAllAsObject() || {}),
			registeredComponents:
				this.#componentRegistry?.definitions.size || 0,
			cacheSize: this.#adaptationCache?.size || 0,
		};
	}

	/**
	 * @function clearCache
	 * @description Clears the adaptation selection cache.
	 * @public
	 * @returns {void}
	 */
	clearCache() {
		this.#adaptationCache?.clear();
	}
}

// Export for use in other modules
export default AdaptiveRenderer;
