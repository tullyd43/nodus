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
  /**
   * @class
   * @param {object} stateManager - An instance of HybridStateManager or a similar state management class.
   */
  constructor(stateManager) {
    /**
     * @property {object} stateManager - The state manager instance.
     * @public
     */
    this.stateManager = stateManager;
    /**
     * @property {Map<string, object>} componentDefinitions - A map of registered component definitions.
     * @private
     */
    this.componentDefinitions = new Map();
    /**
     * @property {Map<string, object>} adaptationCache - A cache for storing the results of adaptation selections.
     * @private
     */
    this.adaptationCache = new Map();
    /**
     * @property {object} renderMetrics - An object for storing performance metrics.
     * @private
     */
    this.renderMetrics = {
      renderCount: 0,
      adaptationTime: [],
      cacheHitRate: 0,
      cacheHits: 0,
    };
  }

  /**
   * @function registerComponent
   * @description Registers a component definition with its adaptation rules.
   * @param {string} componentId - The unique identifier for the component.
   * @param {object} definition - The component definition object.
   * @returns {void}
   */
  registerComponent(componentId, definition) {
    this.componentDefinitions.set(componentId, {
      id: componentId,
      adaptations: definition.adaptations || {},
      defaultAdaptation: definition.defaultAdaptation || "minimal",
      render: definition.render || {},
      ...definition,
    });
  }

  getComponent(def) {
    // Prefer type metadata from schema registry
    const typeInfo = this.stateManager.schema?.entities?.get?.(def?.type_name);
    // existing resolution...
    const component = this.componentDefinitions.get(def.id);
    return { ...component, __schema: typeInfo };
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
    const startTime = performance.now();

    const component = this.componentDefinitions.get(componentId);
    if (!component) {
      console.warn(`AdaptiveRenderer: Component ${componentId} not found`);
      return this.renderFallback(componentId, context);
    }

    // Ensure context is a RenderContext instance
    const renderContext =
      context instanceof RenderContext
        ? context.extend({ componentId, data })
        : new RenderContext({ ...context, componentId, data });

    // Select appropriate adaptation based on context
    const adaptation = this.selectAdaptation(component, renderContext);

    // Render with selected adaptation
    const result = this.renderAdaptation(
      component,
      adaptation,
      renderContext,
      data,
    );

    // Track metrics
    const duration = performance.now() - startTime;
    this.recordRenderMetrics(duration, !!adaptation.cached);

    return result;
  }

  /**
   * @function selectAdaptation
   * @description Selects the best adaptation for a component based on the current context.
   * @private
   * @param {object} component - The component definition.
   * @param {RenderContext} context - The current rendering context.
   * @returns {object} The selected adaptation.
   */
  selectAdaptation(component, context) {
    const cacheKey = `${component.id}-${JSON.stringify(context.toObject())}`;

    // Check cache first
    if (this.adaptationCache.has(cacheKey)) {
      this.renderMetrics.cacheHits++;
      return { ...this.adaptationCache.get(cacheKey), cached: true };
    }

    // Find best matching adaptation using shared ContextMatcher
    const bestMatch = ContextMatcher.findBestMatch(
      component.adaptations,
      context,
    );

    if (bestMatch) {
      const selectedAdaptation = {
        name: bestMatch.name,
        ...bestMatch,
        cached: false,
      };

      // Cache the selection
      this.adaptationCache.set(cacheKey, selectedAdaptation);
      return selectedAdaptation;
    }

    // Fallback to default
    const defaultAdaptation = {
      name: component.defaultAdaptation,
      ...component.adaptations[component.defaultAdaptation],
      cached: false,
    };

    this.adaptationCache.set(cacheKey, defaultAdaptation);
    return defaultAdaptation;
  }

  /**
   * @function renderAdaptation
   * @description Renders a component using the selected adaptation.
   * @private
   * @param {object} component - The component definition.
   * @param {object} adaptation - The selected adaptation.
   * @param {RenderContext} context - The current rendering context.
   * @param {object} data - Additional data for rendering.
   * @returns {HTMLElement|object} The rendered component.
   */
  renderAdaptation(component, adaptation, context, data) {
    const renderConfig = adaptation.render || {};
    const renderMethod =
      component.render[adaptation.name] || component.render.default;

    if (!renderMethod) {
      console.warn(
        `AdaptiveRenderer: No render method for adaptation ${adaptation.name}`,
      );
      return this.renderFallback(component.id, context);
    }

    try {
      // Create render context
      const renderContext = {
        ...context.toObject(),
        adaptation: adaptation.name,
        config: renderConfig,
        component: component.id,
        data,
      };

      // Execute render method
      if (typeof renderMethod === "function") {
        return renderMethod(renderContext);
      } else if (typeof renderMethod === "string") {
        // Template-based rendering
        return this.renderTemplate(renderMethod, renderContext);
      } else {
        // Static content
        return renderMethod;
      }
    } catch (error) {
      console.error(
        `AdaptiveRenderer: Error rendering ${component.id}:`,
        error,
      );
      return this.renderError(component.id, error, context);
    }
  }

  /**
   * @function renderTemplate
   * @description Renders a component from a string template.
   * @private
   * @param {string} template - The string template to render.
   * @param {object} context - The data to inject into the template.
   * @returns {HTMLElement} The rendered HTML element.
   */
  renderTemplate(template, context) {
    let rendered = template;

    // Simple variable substitution {{variable}}
    rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return context[varName] || context.data?.[varName] || "";
    });

    // Create DOM element from template
    const wrapper = document.createElement("div");
    wrapper.innerHTML = rendered;
    return wrapper.children.length === 1 ? wrapper.firstChild : wrapper;
  }

  /**
   * @function renderFallback
   * @description Renders a fallback UI for when a component is not found.
   * @private
   * @param {string} componentId - The ID of the missing component.
   * @param {RenderContext} context - The current rendering context.
   * @returns {HTMLElement} The fallback element.
   */
  renderFallback(componentId, context) {
    const fallback = document.createElement("div");
    fallback.className = "adaptive-renderer-fallback";
    fallback.innerHTML = `
      <div class="fallback-content">
        <strong>Component Not Found</strong>
        <p>Component: ${componentId}</p>
        <p>Context: ${context.purpose || "unknown"}</p>
      </div>
    `;
    return fallback;
  }

  /**
   * @function renderError
   * @description Renders an error UI when a component fails to render.
   * @private
   * @param {string} componentId - The ID of the component that failed.
   * @param {Error} error - The error that occurred.
   * @param {RenderContext} context - The current rendering context.
   * @returns {HTMLElement} The error element.
   */
  renderError(componentId, error, context) {
    const errorEl = document.createElement("div");
    errorEl.className = "adaptive-renderer-error";
    errorEl.innerHTML = `
      <div class="error-content">
        <strong>Render Error</strong>
        <p>Component: ${componentId}</p>
        <p>Error: ${error.message}</p>
      </div>
    `;
    return errorEl;
  }

  /**
   * @function recordRenderMetrics
   * @description Records performance metrics for a render operation.
   * @private
   * @param {number} duration - The duration of the render operation in milliseconds.
   * @param {boolean} wasFromCache - Whether the adaptation was retrieved from the cache.
   * @returns {void}
   */
  recordRenderMetrics(duration, wasFromCache) {
    this.renderMetrics.renderCount++;
    this.renderMetrics.adaptationTime.push(duration);

    // Track cache hits accurately
    if (wasFromCache) {
      this.renderMetrics.cacheHits = (this.renderMetrics.cacheHits || 0) + 1;
    }

    // Keep only last 100 measurements
    if (this.renderMetrics.adaptationTime.length > 100) {
      this.renderMetrics.adaptationTime.shift();
    }

    // Calculate accurate cache hit rate
    this.renderMetrics.cacheHitRate =
      this.renderMetrics.renderCount > 0
        ? (this.renderMetrics.cacheHits || 0) / this.renderMetrics.renderCount
        : 0;

    // Feed into HybridStateManager metrics if available
    if (this.stateManager?.metrics?.rendering) {
      this.stateManager.metrics.rendering.adaptiveRenderTimes =
        this.renderMetrics.adaptationTime;
      this.stateManager.metrics.rendering.averageAdaptiveRenderTime =
        this.renderMetrics.adaptationTime.reduce((sum, time) => sum + time, 0) /
        this.renderMetrics.adaptationTime.length;
      this.stateManager.metrics.rendering.componentCacheHitRate =
        this.renderMetrics.cacheHitRate;
    }
  }

  /**
   * @function getMetrics
   * @description Retrieves the current performance metrics.
   * @public
   * @returns {object} The performance metrics.
   */
  getMetrics() {
    return {
      ...this.renderMetrics,
      averageRenderTime:
        this.renderMetrics.adaptationTime.length > 0
          ? this.renderMetrics.adaptationTime.reduce(
              (sum, time) => sum + time,
              0,
            ) / this.renderMetrics.adaptationTime.length
          : 0,
      registeredComponents: this.componentDefinitions.size,
      cacheSize: this.adaptationCache.size,
    };
  }

  /**
   * @function clearCache
   * @description Clears the adaptation selection cache.
   * @public
   * @returns {void}
   */
  clearCache() {
    this.adaptationCache.clear();
  }

  /**
   * @function registerComponents
   * @description Registers multiple components at once.
   * @public
   * @param {object} definitions - An object where keys are component IDs and values are component definitions.
   * @returns {void}
   */
  registerComponents(definitions) {
    for (const [componentId, definition] of Object.entries(definitions)) {
      this.registerComponent(componentId, definition);
    }
  }
}

// Export for use in other modules
export default AdaptiveRenderer;
