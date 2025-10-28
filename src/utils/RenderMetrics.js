/**
 * RenderMetrics.js
 * Collects frame rate, layout latency, and cache metrics for Nodus V7.1
 * Integrates with MetricsRegistry and provides real-time performance monitoring
 */

export class RenderMetrics {
  constructor(options = {}) {
    this.options = {
      sampleSize: 60,        // Number of frames to average
      reportInterval: 1000,  // How often to emit updates (ms)
      trackLatency: true,    // Track render latency
      trackMemory: false,    // Track memory usage (expensive)
      ...options
    };

    // FPS tracking
    this.fps = 0;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];

    // Latency tracking
    this.renderLatencies = [];
    this.layoutLatencies = [];
    this.interactionLatencies = [];

    // Memory tracking (if enabled)
    this.memoryStats = {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };

    // Subscribers for real-time updates
    this.subscribers = new Set();
    this.metricsHistory = [];

    // Performance observer for paint metrics
    this.setupPerformanceObserver();

    // Start the main tracking loop
    this.startTracking();
  }

  /**
   * Start the main FPS tracking loop
   */
  startTracking() {
    this.rafId = requestAnimationFrame(this.trackFrame.bind(this));
    
    // Set up periodic reporting
    this.reportInterval = setInterval(() => {
      this.calculateMetrics();
      this.emitUpdate();
    }, this.options.reportInterval);

    console.log('[RenderMetrics] Started tracking performance metrics');
  }

  /**
   * Stop tracking and clean up
   */
  stopTracking() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    console.log('[RenderMetrics] Stopped tracking performance metrics');
  }

  /**
   * Track individual frame for FPS calculation
   */
  trackFrame(currentTime) {
    this.frameCount++;
    
    // Calculate frame time
    const frameTime = currentTime - this.lastFrameTime;
    this.frameTimes.push(frameTime);
    
    // Keep only recent frames for averaging
    if (this.frameTimes.length > this.options.sampleSize) {
      this.frameTimes.shift();
    }

    this.lastFrameTime = currentTime;

    // Continue tracking
    this.rafId = requestAnimationFrame(this.trackFrame.bind(this));
  }

  /**
   * Calculate current performance metrics
   */
  calculateMetrics() {
    // Calculate FPS from frame times
    if (this.frameTimes.length > 0) {
      const avgFrameTime = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
      this.fps = Math.round(1000 / avgFrameTime);
    }

    // Track memory if enabled
    if (this.options.trackMemory && performance.memory) {
      this.memoryStats = {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }

    // Store historical data
    const metrics = this.getCurrentMetrics();
    this.metricsHistory.push({
      ...metrics,
      timestamp: Date.now()
    });

    // Keep only last 100 entries
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }
  }

  /**
   * Set up Performance Observer for paint and layout metrics
   */
  setupPerformanceObserver() {
    if (!('PerformanceObserver' in window)) {
      console.warn('[RenderMetrics] PerformanceObserver not supported');
      return;
    }

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.handlePerformanceEntry(entry);
        }
      });

      // Observe paint and layout metrics
      this.performanceObserver.observe({ 
        entryTypes: ['paint', 'measure', 'navigation', 'layout-shift'] 
      });
    } catch (error) {
      console.warn('[RenderMetrics] Failed to setup PerformanceObserver:', error);
    }
  }

  /**
   * Handle performance observer entries
   */
  handlePerformanceEntry(entry) {
    switch (entry.entryType) {
      case 'paint':
        if (entry.name === 'first-contentful-paint') {
          this.firstContentfulPaint = entry.startTime;
        }
        break;
      
      case 'measure':
        if (entry.name.startsWith('grid-')) {
          this.recordCustomLatency('grid', entry.duration);
        }
        break;
      
      case 'layout-shift':
        this.recordLayoutShift(entry.value);
        break;
    }
  }

  /**
   * Record render latency for specific operations
   */
  recordRenderLatency(latency, operation = 'render') {
    if (!this.options.trackLatency) return;

    this.renderLatencies.push({
      latency,
      operation,
      timestamp: Date.now()
    });

    // Keep only recent latencies
    if (this.renderLatencies.length > this.options.sampleSize) {
      this.renderLatencies.shift();
    }
  }

  /**
   * Record layout latency (grid operations)
   */
  recordLayoutLatency(latency, operation = 'layout') {
    if (!this.options.trackLatency) return;

    this.layoutLatencies.push({
      latency,
      operation,
      timestamp: Date.now()
    });

    if (this.layoutLatencies.length > this.options.sampleSize) {
      this.layoutLatencies.shift();
    }
  }

  /**
   * Record interaction latency (user input to visual response)
   */
  recordInteractionLatency(latency, interaction = 'unknown') {
    if (!this.options.trackLatency) return;

    this.interactionLatencies.push({
      latency,
      interaction,
      timestamp: Date.now()
    });

    if (this.interactionLatencies.length > this.options.sampleSize) {
      this.interactionLatencies.shift();
    }
  }

  /**
   * Record custom latency measurements
   */
  recordCustomLatency(category, latency) {
    switch (category) {
      case 'grid':
        this.recordLayoutLatency(latency, 'grid-operation');
        break;
      case 'render':
        this.recordRenderLatency(latency, 'component-render');
        break;
      case 'interaction':
        this.recordInteractionLatency(latency, 'user-interaction');
        break;
    }
  }

  /**
   * Record layout shift
   */
  recordLayoutShift(value) {
    // Store cumulative layout shift data
    if (!this.layoutShifts) {
      this.layoutShifts = [];
    }
    
    this.layoutShifts.push({
      value,
      timestamp: Date.now()
    });

    // Keep only recent shifts
    if (this.layoutShifts.length > 50) {
      this.layoutShifts.shift();
    }
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics() {
    const avgRenderLatency = this.calculateAverageLatency(this.renderLatencies);
    const avgLayoutLatency = this.calculateAverageLatency(this.layoutLatencies);
    const avgInteractionLatency = this.calculateAverageLatency(this.interactionLatencies);

    return {
      fps: this.fps,
      frameCount: this.frameCount,
      avgRenderLatency,
      avgLayoutLatency,
      avgInteractionLatency,
      memory: this.options.trackMemory ? this.memoryStats : null,
      firstContentfulPaint: this.firstContentfulPaint || null,
      cumulativeLayoutShift: this.calculateCLS()
    };
  }

  /**
   * Calculate average latency from latency array
   */
  calculateAverageLatency(latencies) {
    if (latencies.length === 0) return 0;
    
    const sum = latencies.reduce((total, entry) => total + entry.latency, 0);
    return Math.round(sum / latencies.length * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate Cumulative Layout Shift
   */
  calculateCLS() {
    if (!this.layoutShifts || this.layoutShifts.length === 0) return 0;
    
    return this.layoutShifts.reduce((sum, shift) => sum + shift.value, 0);
  }

  /**
   * Subscribe to real-time metric updates
   */
  onUpdate(callback) {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Emit updates to all subscribers
   */
  emitUpdate() {
    const metrics = this.getCurrentMetrics();
    
    for (const callback of this.subscribers) {
      try {
        callback(metrics);
      } catch (error) {
        console.warn('[RenderMetrics] Subscriber error:', error);
      }
    }
  }

  /**
   * Get performance summary for reporting
   */
  getPerformanceSummary() {
    const metrics = this.getCurrentMetrics();
    const history = this.metricsHistory.slice(-10); // Last 10 samples

    return {
      current: metrics,
      trend: {
        fps: {
          current: metrics.fps,
          avg: history.length > 0 ? 
            Math.round(history.reduce((sum, h) => sum + h.fps, 0) / history.length) : 
            metrics.fps,
          min: history.length > 0 ? Math.min(...history.map(h => h.fps)) : metrics.fps,
          max: history.length > 0 ? Math.max(...history.map(h => h.fps)) : metrics.fps
        },
        latency: {
          render: metrics.avgRenderLatency,
          layout: metrics.avgLayoutLatency,
          interaction: metrics.avgInteractionLatency
        }
      },
      issues: this.detectPerformanceIssues(metrics)
    };
  }

  /**
   * Detect performance issues based on thresholds
   */
  detectPerformanceIssues(metrics) {
    const issues = [];

    if (metrics.fps < 30) {
      issues.push({
        type: 'low_fps',
        severity: metrics.fps < 15 ? 'critical' : 'warning',
        message: `Low frame rate: ${metrics.fps} FPS`,
        suggestion: 'Consider enabling performance mode'
      });
    }

    if (metrics.avgRenderLatency > 16) {
      issues.push({
        type: 'high_render_latency',
        severity: metrics.avgRenderLatency > 50 ? 'critical' : 'warning',
        message: `High render latency: ${metrics.avgRenderLatency}ms`,
        suggestion: 'Optimize component rendering'
      });
    }

    if (metrics.avgLayoutLatency > 50) {
      issues.push({
        type: 'high_layout_latency',
        severity: metrics.avgLayoutLatency > 100 ? 'critical' : 'warning',
        message: `High layout latency: ${metrics.avgLayoutLatency}ms`,
        suggestion: 'Optimize grid operations'
      });
    }

    if (metrics.cumulativeLayoutShift > 0.1) {
      issues.push({
        type: 'layout_instability',
        severity: metrics.cumulativeLayoutShift > 0.25 ? 'critical' : 'warning',
        message: `High layout shift: ${metrics.cumulativeLayoutShift.toFixed(3)}`,
        suggestion: 'Reduce layout changes during interactions'
      });
    }

    return issues;
  }

  /**
   * Export metrics data for analysis
   */
  exportData() {
    return {
      current: this.getCurrentMetrics(),
      history: this.metricsHistory,
      config: this.options,
      performance: this.getPerformanceSummary()
    };
  }

  /**
   * Reset all collected metrics
   */
  reset() {
    this.frameCount = 0;
    this.frameTimes = [];
    this.renderLatencies = [];
    this.layoutLatencies = [];
    this.interactionLatencies = [];
    this.metricsHistory = [];
    this.layoutShifts = [];
    this.firstContentfulPaint = null;
    
    console.log('[RenderMetrics] Metrics reset');
  }

  /**
   * Get current FPS (getter for compatibility)
   */
  get currentFPS() {
    return this.fps;
  }
}

export default RenderMetrics;
