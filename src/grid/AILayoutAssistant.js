/**
 * AI Layout Assistant (Future Feature)
 * Framework for analyzing layout patterns and suggesting improvements
 * Integrates with HybridStateManager and existing AI/embedding systems
 */

export class AILayoutAssistant {
  constructor(hybridStateManager, options = {}) {
    this.stateManager = hybridStateManager;
    this.options = {
      enabled: false, // Controlled by system.grid_ai_suggestions policy
      minDataPoints: 50, // Minimum layout changes before suggestions
      suggestionCooldown: 300000, // 5 minutes between suggestions
      maxSuggestions: 3, // Maximum suggestions to show at once
      ...options,
    };

    this.patterns = new Map();
    this.suggestions = new Map();
    this.lastSuggestionTime = 0;
    this.analysisQueue = [];

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for layout changes to build pattern database
    if (typeof EventBus !== "undefined") {
      EventBus.on("layoutChanged", this.onLayoutChanged.bind(this));
      EventBus.on("policyChanged", this.onPolicyChanged.bind(this));
    }
  }

  onLayoutChanged(changeEvent) {
    if (!this.isEnabled()) return;

    // Queue for analysis (batch processing for performance)
    this.analysisQueue.push({
      ...changeEvent,
      timestamp: Date.now(),
      userId: this.getCurrentUserId(),
    });

    // Process queue periodically
    this.scheduleAnalysis();
  }

  onPolicyChanged(data) {
    if (data.domain === "system" && data.key === "grid_ai_suggestions") {
      this.options.enabled = data.value;

      if (!data.value) {
        // Clear suggestions when disabled
        this.clearSuggestions();
      }
    }
  }

  isEnabled() {
    try {
      // Check policy first
      const context = window.appViewModel?.context;
      if (context) {
        return context.getBooleanPolicy("system", "grid_ai_suggestions", false);
      }
    } catch (error) {
      console.warn("Could not check AI suggestions policy:", error);
    }

    return this.options.enabled;
  }

  getCurrentUserId() {
    try {
      return window.appViewModel?.getCurrentUser?.()?.id || "anonymous";
    } catch (error) {
      return "anonymous";
    }
  }

  scheduleAnalysis() {
    // Debounced analysis to avoid performance impact
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }

    this.analysisTimeout = setTimeout(() => {
      this.processAnalysisQueue();
    }, 5000); // Analyze every 5 seconds
  }

  async processAnalysisQueue() {
    if (this.analysisQueue.length === 0) return;

    try {
      // Take a batch for processing
      const batch = this.analysisQueue.splice(0, 10);

      // Analyze patterns
      await this.analyzeLayoutPatterns(batch);

      // Generate suggestions if appropriate
      if (this.shouldGenerateSuggestions()) {
        await this.generateSuggestions();
      }
    } catch (error) {
      console.error("AI layout analysis failed:", error);
    }
  }

  async analyzeLayoutPatterns(changes) {
    // Future: Sophisticated pattern analysis

    // Track block usage patterns
    for (const change of changes) {
      const blockId = change.blockId;
      const pattern = this.patterns.get(blockId) || {
        moveCount: 0,
        resizeCount: 0,
        positions: [],
        sizes: [],
        userIds: new Set(),
        firstSeen: change.timestamp,
        lastModified: change.timestamp,
      };

      // Update pattern data
      if (change.changeType.includes("move") || change.changeType === "drag") {
        pattern.moveCount++;
        pattern.positions.push({
          x: change.position.x,
          y: change.position.y,
          timestamp: change.timestamp,
        });
      }

      if (change.changeType.includes("resize")) {
        pattern.resizeCount++;
        pattern.sizes.push({
          w: change.position.w,
          h: change.position.h,
          timestamp: change.timestamp,
        });
      }

      pattern.userIds.add(change.userId);
      pattern.lastModified = change.timestamp;

      // Keep only recent data (memory management)
      pattern.positions = pattern.positions.slice(-20);
      pattern.sizes = pattern.sizes.slice(-20);

      this.patterns.set(blockId, pattern);
    }

    // Future: Use embedding system for semantic analysis
    if (this.stateManager?.embeddingState) {
      // Could analyze layout semantics using embeddings
      // this.analyzeLayoutSemantics(changes);
    }
  }

  shouldGenerateSuggestions() {
    const now = Date.now();
    const timeSinceLastSuggestion = now - this.lastSuggestionTime;
    const hasEnoughData = this.patterns.size >= this.options.minDataPoints;
    const cooldownPassed =
      timeSinceLastSuggestion > this.options.suggestionCooldown;

    return hasEnoughData && cooldownPassed && this.isEnabled();
  }

  async generateSuggestions() {
    try {
      const suggestions = [];

      // Analyze frequent moves (blocks that get moved often)
      const frequentlyMoved = this.findFrequentlyMovedBlocks();
      if (frequentlyMoved.length > 0) {
        suggestions.push({
          type: "layout_optimization",
          title: "Optimize frequently moved blocks",
          description: `${frequentlyMoved.length} blocks are moved frequently. Consider reorganizing the layout.`,
          blocks: frequentlyMoved,
          confidence: 0.7,
          action: "suggest_positions",
        });
      }

      // Analyze clustering opportunities
      const clusterSuggestion = this.analyzeClusteringOpportunities();
      if (clusterSuggestion) {
        suggestions.push(clusterSuggestion);
      }

      // Analyze size inefficiencies
      const sizeSuggestion = this.analyzeSizeInefficiencies();
      if (sizeSuggestion) {
        suggestions.push(sizeSuggestion);
      }

      // Store and emit suggestions
      if (suggestions.length > 0) {
        this.storeSuggestions(suggestions);
        this.lastSuggestionTime = Date.now();

        EventBus.emit("aiLayoutSuggestions", {
          suggestions: suggestions.slice(0, this.options.maxSuggestions),
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("AI suggestion generation failed:", error);
    }
  }

  findFrequentlyMovedBlocks() {
    const threshold = 5; // Moved more than 5 times
    return Array.from(this.patterns.entries())
      .filter(([blockId, pattern]) => pattern.moveCount > threshold)
      .map(([blockId, pattern]) => ({
        blockId,
        moveCount: pattern.moveCount,
        lastPosition: pattern.positions[pattern.positions.length - 1],
      }))
      .sort((a, b) => b.moveCount - a.moveCount);
  }

  analyzeClusteringOpportunities() {
    // Future: Analyze if related blocks could be grouped together
    // Based on usage patterns, semantic similarity, etc.

    // Placeholder implementation
    const relatedBlocks = this.findRelatedBlocks();
    if (relatedBlocks.length > 1) {
      return {
        type: "clustering",
        title: "Group related blocks",
        description: `Consider grouping ${relatedBlocks.length} related blocks together for better organization.`,
        blocks: relatedBlocks,
        confidence: 0.6,
        action: "suggest_grouping",
      };
    }

    return null;
  }

  findRelatedBlocks() {
    // Future: Use semantic analysis to find related blocks
    // For now, simple heuristic based on modification patterns
    const recentlyModified = Array.from(this.patterns.entries())
      .filter(([blockId, pattern]) => {
        const timeSinceModified = Date.now() - pattern.lastModified;
        return timeSinceModified < 3600000; // Modified in last hour
      })
      .map(([blockId]) => blockId);

    return recentlyModified.slice(0, 3); // Max 3 for clustering
  }

  analyzeSizeInefficiencies() {
    // Look for blocks that get resized frequently
    const frequentlyResized = Array.from(this.patterns.entries())
      .filter(([blockId, pattern]) => pattern.resizeCount > 3)
      .map(([blockId, pattern]) => ({
        blockId,
        resizeCount: pattern.resizeCount,
        averageSize: this.calculateAverageSize(pattern.sizes),
      }));

    if (frequentlyResized.length > 0) {
      return {
        type: "size_optimization",
        title: "Optimize block sizes",
        description: `${frequentlyResized.length} blocks are resized frequently. Consider setting optimal default sizes.`,
        blocks: frequentlyResized,
        confidence: 0.5,
        action: "suggest_sizes",
      };
    }

    return null;
  }

  calculateAverageSize(sizes) {
    if (sizes.length === 0) return { w: 2, h: 2 };

    const avgW = sizes.reduce((sum, size) => sum + size.w, 0) / sizes.length;
    const avgH = sizes.reduce((sum, size) => sum + size.h, 0) / sizes.length;

    return {
      w: Math.round(avgW),
      h: Math.round(avgH),
    };
  }

  storeSuggestions(suggestions) {
    const timestamp = Date.now();
    suggestions.forEach((suggestion, index) => {
      this.suggestions.set(`${timestamp}_${index}`, {
        ...suggestion,
        id: `${timestamp}_${index}`,
        created: timestamp,
        dismissed: false,
      });
    });

    // Clean up old suggestions
    this.cleanupOldSuggestions();
  }

  cleanupOldSuggestions() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    for (const [id, suggestion] of this.suggestions.entries()) {
      if (suggestion.created < cutoff) {
        this.suggestions.delete(id);
      }
    }
  }

  // Public API for UI components

  async applySuggestion(suggestionId) {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) {
      throw new Error("Suggestion not found");
    }

    try {
      // Future: Implement suggestion application
      switch (suggestion.action) {
        case "suggest_positions":
          await this.applySuggestedPositions(suggestion);
          break;
        case "suggest_grouping":
          await this.applySuggestedGrouping(suggestion);
          break;
        case "suggest_sizes":
          await this.applySuggestedSizes(suggestion);
          break;
        default:
          throw new Error(`Unknown suggestion action: ${suggestion.action}`);
      }

      // Mark as applied and emit event
      suggestion.applied = true;
      EventBus.emit("aiSuggestionApplied", { suggestionId, suggestion });
    } catch (error) {
      console.error("Failed to apply AI suggestion:", error);
      throw error;
    }
  }

  dismissSuggestion(suggestionId) {
    const suggestion = this.suggestions.get(suggestionId);
    if (suggestion) {
      suggestion.dismissed = true;
      EventBus.emit("aiSuggestionDismissed", { suggestionId });
    }
  }

  getActiveSuggestions() {
    return Array.from(this.suggestions.values())
      .filter((s) => !s.dismissed && !s.applied)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.options.maxSuggestions);
  }

  // Future implementation methods (stubs for now)

  async applySuggestedPositions(suggestion) {
    // Future: Apply optimal positions based on usage patterns
    console.log("Applying suggested positions:", suggestion.blocks);
  }

  async applySuggestedGrouping(suggestion) {
    // Future: Group related blocks together
    console.log("Applying suggested grouping:", suggestion.blocks);
  }

  async applySuggestedSizes(suggestion) {
    // Future: Apply optimal sizes based on content analysis
    console.log("Applying suggested sizes:", suggestion.blocks);
  }

  clearSuggestions() {
    this.suggestions.clear();
    EventBus.emit("aiSuggestionsCleared");
  }

  // Analytics and monitoring

  getAnalyticsData() {
    return {
      patternsTracked: this.patterns.size,
      activeSuggestions: this.getActiveSuggestions().length,
      totalSuggestions: this.suggestions.size,
      analysisQueueSize: this.analysisQueue.length,
      enabled: this.isEnabled(),
    };
  }
}

// Future: AI Suggestion UI Component (stub)
export class AISuggestionPanel {
  constructor(assistant) {
    this.assistant = assistant;
    this.setupEventListeners();
  }

  setupEventListeners() {
    EventBus.on("aiLayoutSuggestions", this.onSuggestionsReceived.bind(this));
  }

  onSuggestionsReceived(data) {
    // Future: Show suggestion panel in UI
    console.log("AI suggestions available:", data.suggestions);

    // Could integrate with existing notification system
    if (typeof showGridToast !== "undefined") {
      showGridToast(
        `💡 ${data.suggestions.length} layout suggestions available`,
        "info",
        5000,
      );
    }
  }

  // Future: Render suggestion UI
  render() {
    // Placeholder for future UI implementation
    return document.createElement("div");
  }
}

export default AILayoutAssistant;
