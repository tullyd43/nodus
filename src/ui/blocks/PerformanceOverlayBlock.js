// ui/blocks/PerformanceOverlayBlock.js
// Composable performance monitoring building block

/**
 * Performance Overlay BuildingBlock
 * Real-time metrics visualization as a composable component
 */
export function PerformanceOverlayBlock({ context, config = {} }) {
  const container = document.createElement("div");
  container.className = "performance-overlay-block";

  // Apply theme-aware styling
  const theme = context.getThemeVariables();
  container.style.cssText = `
    padding: ${config.padding || "1rem"};
    border-radius: ${config.borderRadius || "8px"};
    background: ${config.background || theme["--surface-elevated"]};
    color: ${config.color || theme["--text"]};
    font-family: 'Courier New', monospace;
    font-size: ${config.fontSize || "12px"};
    border: 1px solid ${theme["--border"]};
    min-width: ${config.minWidth || "250px"};
    max-height: ${config.maxHeight || "400px"};
    overflow-y: auto;
    position: ${config.position || "relative"};
  `;

  // Fixed positioning for overlay mode
  if (config.overlay) {
    container.style.position = "fixed";
    container.style.bottom = config.bottom || "10px";
    container.style.right = config.right || "10px";
    container.style.zIndex = config.zIndex || "9999";
    container.style.background = config.overlayBackground || "rgba(0,0,0,0.85)";
  }

  // Create title
  const title = document.createElement("h4");
  title.textContent = config.title || "System Performance";
  title.style.cssText = `
    margin: 0 0 0.75rem 0;
    color: ${theme["--primary"]};
    font-size: 14px;
    font-weight: bold;
  `;
  container.appendChild(title);

  // Create metrics container
  const metricsContainer = document.createElement("div");
  metricsContainer.className = "metrics-container";
  container.appendChild(metricsContainer);

  // Performance data state
  let updateInterval = null;
  let isActive = true;

  /**
   * Format metrics for display
   */
  function formatMetrics(metrics) {
    const sections = [];

    // System Load Section
    if (metrics.system) {
      sections.push({
        title: "System Load",
        items: [
          {
            label: "Entities",
            value: metrics.system.entityCount || 0,
            unit: "",
          },
          {
            label: "Memory",
            value: formatBytes(metrics.system.memoryUsage || 0),
            unit: "",
          },
          {
            label: "Cache Hit Rate",
            value: (metrics.system.cacheHitRate || 0).toFixed(1),
            unit: "%",
          },
        ],
      });
    }

    // Database Performance
    if (metrics.database) {
      sections.push({
        title: "Database",
        items: [
          {
            label: "Avg Query Time",
            value: (metrics.database.avgQueryTime || 0).toFixed(2),
            unit: "ms",
          },
          {
            label: "Active Queries",
            value: metrics.database.activeQueries || 0,
            unit: "",
          },
          {
            label: "Optimization Score",
            value: (metrics.database.optimizationScore || 0).toFixed(1),
            unit: "/10",
          },
        ],
      });
    }

    // Rendering Performance
    if (metrics.rendering) {
      sections.push({
        title: "Rendering",
        items: [
          {
            label: "Avg Render Time",
            value: (metrics.rendering.averageRenderTime || 0).toFixed(2),
            unit: "ms",
          },
          {
            label: "Components",
            value: metrics.rendering.activeComponents || 0,
            unit: "",
          },
          {
            label: "Cache Hits",
            value: metrics.rendering.cacheHits || 0,
            unit: "",
          },
        ],
      });
    }

    // State Manager
    if (metrics.state) {
      sections.push({
        title: "State Manager",
        items: [
          {
            label: "Undo Stack",
            value: metrics.state.undoStackSize || 0,
            unit: "",
          },
          {
            label: "Pending Ops",
            value: metrics.state.pendingOperations || 0,
            unit: "",
          },
          {
            label: "Offline Ops",
            value: metrics.state.offlineOperations || 0,
            unit: "",
          },
        ],
      });
    }

    // Network & Connectivity
    if (metrics.network) {
      sections.push({
        title: "Network",
        items: [
          {
            label: "Latency",
            value: (metrics.network.latency || 0).toFixed(0),
            unit: "ms",
          },
          {
            label: "Connection",
            value: metrics.network.type || "unknown",
            unit: "",
          },
          {
            label: "Online",
            value: metrics.network.online ? "Yes" : "No",
            unit: "",
          },
        ],
      });
    }

    return sections;
  }

  /**
   * Format bytes to human readable
   */
  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Create metric section
   */
  function createMetricSection(section) {
    const sectionDiv = document.createElement("div");
    sectionDiv.className = "metric-section";
    sectionDiv.style.cssText = `
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid ${theme["--border"]};
    `;

    // Section title
    const sectionTitle = document.createElement("div");
    sectionTitle.textContent = section.title;
    sectionTitle.style.cssText = `
      font-weight: bold;
      color: ${theme["--text"]};
      margin-bottom: 0.25rem;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    sectionDiv.appendChild(sectionTitle);

    // Section items
    section.items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.style.cssText = `
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.125rem;
        font-size: 11px;
      `;

      const label = document.createElement("span");
      label.textContent = item.label + ":";
      label.style.color = theme["--text-muted"];

      const value = document.createElement("span");
      value.textContent = item.value + (item.unit || "");
      value.style.cssText = `
        color: ${getValueColor(item.label, item.value)};
        font-weight: bold;
      `;

      itemDiv.appendChild(label);
      itemDiv.appendChild(value);
      sectionDiv.appendChild(itemDiv);
    });

    return sectionDiv;
  }

  /**
   * Get color based on metric value and type
   */
  function getValueColor(label, value) {
    const numValue = parseFloat(value);

    if (label.includes("Error") || label.includes("Failed")) {
      return numValue > 0 ? theme["--error"] : theme["--success"];
    }

    if (label.includes("Time") || label.includes("Latency")) {
      if (numValue > 100) return theme["--error"];
      if (numValue > 50) return theme["--warning"];
      return theme["--success"];
    }

    if (label.includes("Hit Rate") || label.includes("Score")) {
      if (numValue > 80) return theme["--success"];
      if (numValue > 60) return theme["--warning"];
      return theme["--error"];
    }

    return theme["--text"];
  }

  /**
   * Update metrics display
   */
  function updateMetrics() {
    if (!isActive) return;

    try {
      // Get metrics from various sources
      const metrics = gatherMetrics();

      // Clear previous content
      metricsContainer.innerHTML = "";

      // Format and display metrics
      const sections = formatMetrics(metrics);
      sections.forEach((section) => {
        metricsContainer.appendChild(createMetricSection(section));
      });

      // Add timestamp
      const timestamp = document.createElement("div");
      timestamp.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
      timestamp.style.cssText = `
        font-size: 10px;
        color: ${theme["--text-muted"]};
        text-align: right;
        margin-top: 0.5rem;
        opacity: 0.7;
      `;
      metricsContainer.appendChild(timestamp);
    } catch (error) {
      console.error("PerformanceOverlayBlock: Update error:", error);

      // Show error state
      metricsContainer.innerHTML = `
        <div style="color: ${theme["--error"]}; font-size: 11px;">
          ⚠️ Error loading metrics: ${error.message}
        </div>
      `;
    }
  }

  /**
   * Gather metrics from available sources
   */
  function gatherMetrics() {
    const metrics = {};

    // State Manager metrics
    if (
      context.stateManager &&
      typeof context.stateManager.getPerformanceMetrics === "function"
    ) {
      const stateMetrics = context.stateManager.getPerformanceMetrics();
      metrics.system = {
        entityCount: stateMetrics.entityCount || 0,
        memoryUsage: stateMetrics.memoryUsage || 0,
        cacheHitRate: stateMetrics.cacheHitRate || 0,
      };
      metrics.state = {
        undoStackSize: stateMetrics.undoStackSize || 0,
        pendingOperations: stateMetrics.pendingOperations || 0,
        offlineOperations: stateMetrics.offlineOperations || 0,
      };
      metrics.rendering = stateMetrics.rendering || {};
    }

    // Database metrics (if available)
    if (
      context.databaseOptimizer &&
      typeof context.databaseOptimizer.getPerformanceMetrics === "function"
    ) {
      metrics.database = context.databaseOptimizer.getPerformanceMetrics();
    }

    // Network metrics
    metrics.network = {
      online: navigator.onLine,
      type: navigator.connection?.effectiveType || "unknown",
      latency: context.networkLatency || 0,
    };

    // Browser performance metrics
    if (performance.memory) {
      metrics.browser = {
        heapUsed: performance.memory.usedJSHeapSize,
        heapTotal: performance.memory.totalJSHeapSize,
        heapLimit: performance.memory.jsHeapSizeLimit,
      };
    }

    return metrics;
  }

  /**
   * Start performance monitoring
   */
  function startMonitoring() {
    if (updateInterval) return;

    const refreshRate = config.refreshRate || 2000; // Default 2 seconds
    updateInterval = setInterval(updateMetrics, refreshRate);

    // Initial update
    updateMetrics();
  }

  /**
   * Stop performance monitoring
   */
  function stopMonitoring() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  /**
   * Toggle monitoring state
   */
  function toggleMonitoring() {
    isActive = !isActive;

    if (isActive) {
      startMonitoring();
      container.style.opacity = "1";
    } else {
      stopMonitoring();
      container.style.opacity = "0.5";
    }

    // Update title to show state
    title.textContent = `${config.title || "System Performance"} ${isActive ? "" : "(Paused)"}`;
  }

  // Add click to toggle (if enabled)
  if (config.clickToToggle !== false) {
    title.style.cursor = "pointer";
    title.addEventListener("click", toggleMonitoring);
    title.title = "Click to pause/resume monitoring";
  }

  // Cleanup on removal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === container) {
          stopMonitoring();
          observer.disconnect();
        }
      });
    });
  });

  if (container.parentNode) {
    observer.observe(container.parentNode, { childList: true });
  }

  // Start monitoring if autoStart is enabled (default)
  if (config.autoStart !== false) {
    // Use requestAnimationFrame to start after render
    requestAnimationFrame(() => startMonitoring());
  }

  // Expose control methods for external access
  container._performanceOverlay = {
    start: startMonitoring,
    stop: stopMonitoring,
    toggle: toggleMonitoring,
    update: updateMetrics,
    isActive: () => isActive,
  };

  return container;
}

/**
 * Register the performance overlay block
 */
export function registerPerformanceOverlayBlock(renderer) {
  renderer.registerBlock("performance_overlay", {
    render: PerformanceOverlayBlock,
    config: {
      title: "System Performance",
      refreshRate: 2000,
      autoStart: true,
      clickToToggle: true,
      overlay: false,
      fontSize: "12px",
      padding: "1rem",
    },
    dependencies: ["stateManager"],
  });
}

/**
 * Helper factory for creating performance overlay compositions
 */
export function createPerformanceOverlay(config = {}) {
  return {
    type: "performance_overlay",
    config: {
      title: "Performance Monitor",
      overlay: true,
      refreshRate: 1000,
      ...config,
    },
  };
}

export default PerformanceOverlayBlock;
