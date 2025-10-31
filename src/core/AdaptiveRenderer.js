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
		this.#adaptationCache =
			this.#stateManager.managers.cacheManager?.getCache("adaptations");
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("adaptiveRenderer");
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#forensicLogger?.logAuditEvent("SYSTEM_INITIALIZATION", {
			component: "AdaptiveRenderer",
		});

		// V8.0 Parity: Mandate 4.3 - Apply performance measurement decorator.
		if (this.#metrics) {
			this.render = this.#metrics.measure("render")(
				this.render.bind(this)
			);
		}
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
		// const startTime = performance.now(); // V8.0 Parity: Timing is now handled by the decorator.

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

				// const duration = performance.now() - startTime; // V8.0 Parity: Timing is now handled by the decorator.
				// this.#recordRenderMetrics(duration, !!adaptation.cached);

				return result;
			},
			(error) => this.#renderError(componentId, error, context),
			{ componentId, context }
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
		const renderMethod =
			component.render[adaptation.name] || component.render.default;

		// V8.0 Parity: Use error helper for centralized error management.
		if (!renderMethod) {
			this.#forensicLogger?.warn(
				`AdaptiveRenderer: No render method for adaptation ${adaptation.name}`,
				{ componentId: component.id, adaptationName: adaptation.name }
			);
			return this.#renderFallback(component.id, context);
		}

		// Extend the context with adaptation-specific info for the render function.
		const finalRenderContext = context.extend({
			adaptationName: adaptation.name,
			config: { ...component.defaultConfig, ...adaptation.render },
		});

		// Execute render method
		if (typeof renderMethod === "function") {
			return renderMethod(finalRenderContext);
		} else if (typeof renderMethod === "string") {
			// Template-based rendering
			return this.#renderTemplate(renderMethod, finalRenderContext);
		} else {
			// Static content (less common, but supported)
			console.warn(
				`[AdaptiveRenderer] Render method for ${component.id} is not a function or string.`
			);
			return null;
		}
	}

	/**
	 * @description Renders a component from a string template.
	 * @private
	 * @param {string} template - The string template to render.
	 * @param {object} context - The data to inject into the template.
	 * @returns {HTMLElement|Node} The rendered HTML element.
	 */
	#renderTemplate(template, context) {
		// Simple variable substitution for {{variable}}
		const rendered = template.replace(
			/\{\{([\w.-]+)\}\}/g,
			(match, path) => context.getNestedValue?.(path) ?? ""
		);

		// V8.0 Parity: Use DOMParser for safer HTML creation in browser environments.
		const parser = new DOMParser();
		const doc = parser.parseFromString(rendered, "text/html");

		// If the template resulted in a single element, return it directly.
		// Otherwise, return a document fragment containing all top-level elements.
		if (doc.body.children.length === 1) {
			return doc.body.firstChild;
		}
		const fragment = document.createDocumentFragment();
		Array.from(doc.body.children).forEach((child) =>
			fragment.appendChild(child)
		);
		return fragment;
	}

	/**
	 * @description Renders a fallback UI for when a component is not found.
	 * @private
	 * @param {string} componentId - The ID of the missing component.
	 * @param {RenderContext} context - The current rendering context.
	 * @returns {HTMLElement} The fallback element.
	 */
	#renderFallback(componentId, context) {
		const fallback = document.createElement("div");
		fallback.className = "adaptive-renderer-fallback";
		const content = document.createElement("div");
		content.className = "fallback-content";
		content.innerHTML = `<strong>Component Not Found</strong>`;
		const p1 = document.createElement("p");
		p1.textContent = `Component: ${componentId}`;
		const p2 = document.createElement("p");
		p2.textContent = `Context: ${context.purpose || "unknown"}`;
		content.append(p1, p2);
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
		const content = document.createElement("div");
		content.className = "error-content";
		content.innerHTML = `<strong>Render Error</strong>`;
		const p1 = document.createElement("p");
		p1.textContent = `Component: ${componentId}`;
		const p2 = document.createElement("p");
		p2.textContent = `Error: ${error.message}`;
		content.append(p1, p2);
		errorEl.appendChild(content);
		return errorEl;
	}

	/**
	 * @description Records performance metrics for a render operation.
	 * @private
	 * @param {number} duration - The duration of the render operation in milliseconds.
	 * @param {boolean} wasFromCache - Whether the adaptation was retrieved from the cache.
	 * @returns {void}
	 */
	#recordRenderMetrics(duration, wasFromCache) {
		this.#metrics?.increment("renderCount");
		this.#metrics?.updateAverage("renderTime", duration);
		if (!wasFromCache) this.#metrics?.increment("cacheMisses");
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
