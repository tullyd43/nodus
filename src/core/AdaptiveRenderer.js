// core/AdaptiveRenderer.js
// Replaces level-based rendering with context-driven adaptive rendering

import RenderContext, { ContextMatcher } from './RenderContext.js';

export class AdaptiveRenderer {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.componentDefinitions = new Map();
    this.adaptationCache = new Map();
    this.renderMetrics = {
      renderCount: 0,
      adaptationTime: [],
      cacheHitRate: 0,
      cacheHits: 0
    };
  }

  /**
   * Register a component definition with its adaptation rules
   */
  registerComponent(componentId, definition) {
    this.componentDefinitions.set(componentId, {
      id: componentId,
      adaptations: definition.adaptations || {},
      defaultAdaptation: definition.defaultAdaptation || 'minimal',
      render: definition.render || {},
      ...definition
    });
  }

  /**
   * Main entry point: render component based on context
   */
  render(componentId, context, data = {}) {
    const startTime = performance.now();
    
    const component = this.componentDefinitions.get(componentId);
    if (!component) {
      console.warn(`AdaptiveRenderer: Component ${componentId} not found`);
      return this.renderFallback(componentId, context);
    }

    // Ensure context is a RenderContext instance
    const renderContext = context instanceof RenderContext 
      ? context.extend({ componentId, data })
      : new RenderContext({ ...context, componentId, data });

    // Select appropriate adaptation based on context
    const adaptation = this.selectAdaptation(component, renderContext);
    
    // Render with selected adaptation
    const result = this.renderAdaptation(component, adaptation, renderContext, data);
    
    // Track metrics
    const duration = performance.now() - startTime;
    this.recordRenderMetrics(duration, !!adaptation.cached);
    
    return result;
  }

  /**
   * Select best adaptation based on context triggers
   */
  selectAdaptation(component, context) {
    const cacheKey = `${component.id}-${JSON.stringify(context.toObject())}`;
    
    // Check cache first
    if (this.adaptationCache.has(cacheKey)) {
      return { ...this.adaptationCache.get(cacheKey), cached: true };
    }

    // Find best matching adaptation using shared ContextMatcher
    const bestMatch = ContextMatcher.findBestMatch(component.adaptations, context);
    
    if (bestMatch) {
      const selectedAdaptation = {
        name: bestMatch.name,
        ...bestMatch,
        cached: false
      };
      
      // Cache the selection
      this.adaptationCache.set(cacheKey, selectedAdaptation);
      return selectedAdaptation;
    }

    // Fallback to default
    const defaultAdaptation = {
      name: component.defaultAdaptation,
      ...component.adaptations[component.defaultAdaptation],
      cached: false
    };
    
    this.adaptationCache.set(cacheKey, defaultAdaptation);
    return defaultAdaptation;
  }

  /**
   * Render component with selected adaptation
   */
  renderAdaptation(component, adaptation, context, data) {
    const renderConfig = adaptation.render || {};
    const renderMethod = component.render[adaptation.name] || component.render.default;

    if (!renderMethod) {
      console.warn(`AdaptiveRenderer: No render method for adaptation ${adaptation.name}`);
      return this.renderFallback(component.id, context);
    }

    try {
      // Create render context
      const renderContext = {
        ...context,
        adaptation: adaptation.name,
        config: renderConfig,
        component: component.id,
        data
      };

      // Execute render method
      if (typeof renderMethod === 'function') {
        return renderMethod(renderContext);
      } else if (typeof renderMethod === 'string') {
        // Template-based rendering
        return this.renderTemplate(renderMethod, renderContext);
      } else {
        // Static content
        return renderMethod;
      }
    } catch (error) {
      console.error(`AdaptiveRenderer: Error rendering ${component.id}:`, error);
      return this.renderError(component.id, error, context);
    }
  }

  /**
   * Template-based rendering (simple implementation)
   */
  renderTemplate(template, context) {
    let rendered = template;
    
    // Simple variable substitution {{variable}}
    rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return context[varName] || context.data?.[varName] || '';
    });

    // Create DOM element from template
    const wrapper = document.createElement('div');
    wrapper.innerHTML = rendered;
    return wrapper.children.length === 1 ? wrapper.firstChild : wrapper;
  }

  /**
   * Fallback rendering for missing components
   */
  renderFallback(componentId, context) {
    const fallback = document.createElement('div');
    fallback.className = 'adaptive-renderer-fallback';
    fallback.innerHTML = `
      <div class="fallback-content">
        <strong>Component Not Found</strong>
        <p>Component: ${componentId}</p>
        <p>Context: ${context.purpose || 'unknown'}</p>
      </div>
    `;
    return fallback;
  }

  /**
   * Error rendering
   */
  renderError(componentId, error, context) {
    const errorEl = document.createElement('div');
    errorEl.className = 'adaptive-renderer-error';
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
   * Record performance metrics
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
    this.renderMetrics.cacheHitRate = this.renderMetrics.renderCount > 0 
      ? (this.renderMetrics.cacheHits || 0) / this.renderMetrics.renderCount 
      : 0;

    // Feed into HybridStateManager metrics if available
    if (this.stateManager?.metrics?.rendering) {
      this.stateManager.metrics.rendering.adaptiveRenderTimes = this.renderMetrics.adaptationTime;
      this.stateManager.metrics.rendering.averageAdaptiveRenderTime = 
        this.renderMetrics.adaptationTime.reduce((sum, time) => sum + time, 0) / 
        this.renderMetrics.adaptationTime.length;
      this.stateManager.metrics.rendering.componentCacheHitRate = this.renderMetrics.cacheHitRate;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.renderMetrics,
      averageRenderTime: this.renderMetrics.adaptationTime.length > 0 
        ? this.renderMetrics.adaptationTime.reduce((sum, time) => sum + time, 0) / this.renderMetrics.adaptationTime.length
        : 0,
      registeredComponents: this.componentDefinitions.size,
      cacheSize: this.adaptationCache.size
    };
  }

  /**
   * Clear adaptation cache (useful for development/testing)
   */
  clearCache() {
    this.adaptationCache.clear();
  }

  /**
   * Register multiple components at once
   */
  registerComponents(definitions) {
    for (const [componentId, definition] of Object.entries(definitions)) {
      this.registerComponent(componentId, definition);
    }
  }
}

// Export for use in other modules
export default AdaptiveRenderer;