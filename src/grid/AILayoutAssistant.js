import { showGridToast } from "./GridToastManager.js";
import { DateCore } from "../utils/DateUtils.js";

/**
 * @file AILayoutAssistant.js
 * @description A framework for analyzing grid layout patterns and suggesting improvements using AI/ML principles.
 * This is a forward-looking feature designed to integrate with the HybridStateManager and future embedding systems.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

/**
 * @class AILayoutAssistant
 * @classdesc Analyzes user interactions with the grid layout to identify patterns and generate suggestions for optimization.
 * This class is intended to be a "future feature" and contains a foundational implementation for pattern analysis.
 */
export class AILayoutAssistant {
	/**
	 * Creates an instance of AILayoutAssistant.
	 * @param {import('../core/HybridStateManager.js').default} hybridStateManager - The application's state manager.
	 * @param {object} [options={}] - Configuration options for the assistant.
	 */
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

	/**
	 * Sets up event listeners to monitor layout changes and policy updates.
	 * @private
	 */
	setupEventListeners() {
		// Listen for layout changes via the state manager's event bus
		this.stateManager?.on?.(
			"layoutChanged",
			this.onLayoutChanged.bind(this)
		);
		this.stateManager?.on?.(
			"policyChanged",
			this.onPolicyChanged.bind(this)
		);
	}

	/**
	 * Handles layout change events by adding them to an analysis queue.
	 * @private
	 * @param {object} changeEvent - The event data for the layout change.
	 */
	onLayoutChanged(changeEvent) {
		if (!this.isEnabled()) return;

		// Queue for analysis (batch processing for performance)
		this.analysisQueue.push({
			...changeEvent,
			timestamp: DateCore.timestamp(),
			userId: this.getCurrentUserId(),
		});

		// Process queue periodically
		this.scheduleAnalysis();
	}

	/**
	 * Handles policy change events to enable or disable the assistant.
	 * @private
	 * @param {object} data - The policy change event data.
	 */
	onPolicyChanged(data) {
		if (data.domain === "system" && data.key === "grid_ai_suggestions") {
			this.options.enabled = data.value;

			if (!data.value) {
				// Clear suggestions when disabled
				this.clearSuggestions();
			}
		}
	}

	/**
	 * Checks if the AI assistant is enabled via system policies.
	 * @returns {boolean} `true` if the assistant is enabled, `false` otherwise.
	 * @public
	 */
	isEnabled() {
		try {
			// Align with V8.0: Check policy via the state manager
			return (
				this.stateManager?.getPolicy?.("system.grid_ai_suggestions") ??
				this.options.enabled
			);
		} catch (error) {
			console.warn(
				"Could not check AI suggestions policy:",
				error.message
			);
		}

		return this.options.enabled;
	}

	/**
	 * Gets the current user's ID from the application's view model.
	 * @private
	 * @returns {string} The current user's ID or 'anonymous'.
	 */
	getCurrentUserId() {
		try {
			// Align with V8.0: Get user context from the security manager
			return (
				this.stateManager?.managers?.securityManager?.context?.userId ||
				"anonymous"
			);
		} catch (error) {
			console.warn("Could not get current user ID:", error.message);
			return "anonymous";
		}
	}

	/**
	 * Schedules a debounced analysis of the queued layout changes.
	 * @private
	 */
	scheduleAnalysis() {
		// Debounced analysis to avoid performance impact
		if (this.analysisTimeout) {
			clearTimeout(this.analysisTimeout);
		}

		this.analysisTimeout = setTimeout(() => {
			this.processAnalysisQueue();
		}, 5000); // Analyze every 5 seconds
	}

	/**
	 * Processes a batch of layout changes from the analysis queue.
	 * @private
	 * @returns {Promise<void>}
	 */
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

	/**
	 * Analyzes layout change patterns to build a database of user interactions.
	 * @private
	 * @param {object[]} changes - An array of layout change events.
	 * @returns {Promise<void>}
	 */
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
			if (
				change.changeType.includes("move") ||
				change.changeType === "drag"
			) {
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

	/**
	 * Determines if enough data has been collected and enough time has passed to generate new suggestions.
	 * @private
	 * @returns {boolean} `true` if suggestions should be generated.
	 */
	shouldGenerateSuggestions() {
		const now = DateCore.timestamp();
		const timeSinceLastSuggestion = now - this.lastSuggestionTime;
		const hasEnoughData = this.patterns.size >= this.options.minDataPoints;
		const cooldownPassed =
			timeSinceLastSuggestion > this.options.suggestionCooldown;

		return hasEnoughData && cooldownPassed && this.isEnabled();
	}

	/**
	 * Generates layout suggestions based on the analyzed patterns.
	 * @private
	 * @returns {Promise<void>}
	 */
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
				this.lastSuggestionTime = DateCore.timestamp();

				this.stateManager?.emit?.("aiLayoutSuggestions", {
					suggestions: suggestions.slice(
						0,
						this.options.maxSuggestions
					),
					timestamp: DateCore.timestamp(),
				});
			}
		} catch (error) {
			console.error("AI suggestion generation failed:", error);
		}
	}

	/**
	 * Finds blocks that have been moved frequently.
	 * @private
	 * @returns {object[]} An array of frequently moved block objects.
	 */
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

	/**
	 * Analyzes patterns to find opportunities for clustering related blocks.
	 * @private
	 * @returns {object|null} A suggestion object for clustering, or null.
	 */
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

	/**
	 * Finds blocks that have been modified recently.
	 * @private
	 * @returns {string[]} An array of recently modified block IDs.
	 */
	findRelatedBlocks() {
		// Future: Use semantic analysis to find related blocks
		// For now, simple heuristic based on modification patterns
		const recentlyModified = Array.from(this.patterns.entries())
			.filter(([blockId, pattern]) => {
				const timeSinceModified =
					DateCore.timestamp() - pattern.lastModified;
				return timeSinceModified < 3600000; // Modified in last hour
			})
			.map(([blockId]) => blockId);

		return recentlyModified.slice(0, 3); // Max 3 for clustering
	}

	/**
	 * Analyzes patterns to find blocks that are frequently resized, suggesting size inefficiencies.
	 * @private
	 * @returns {object|null} A suggestion object for size optimization, or null.
	 */
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

	/**
	 * Calculates the average size of a block based on its resize history.
	 * @private
	 * @param {object[]} sizes - An array of size objects ({w, h}).
	 * @returns {{w: number, h: number}} The average width and height.
	 */
	calculateAverageSize(sizes) {
		if (sizes.length === 0) return { w: 2, h: 2 };

		const avgW =
			sizes.reduce((sum, size) => sum + size.w, 0) / sizes.length;
		const avgH =
			sizes.reduce((sum, size) => sum + size.h, 0) / sizes.length;

		return {
			w: Math.round(avgW),
			h: Math.round(avgH),
		};
	}

	/**
	 * Stores generated suggestions in memory.
	 * @private
	 * @param {object[]} suggestions - An array of suggestion objects.
	 */
	storeSuggestions(suggestions) {
		const timestamp = DateCore.timestamp();
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

	/**
	 * Removes old suggestions from the in-memory store to manage memory.
	 * @private
	 */
	cleanupOldSuggestions() {
		const cutoff = DateCore.timestamp() - 24 * 60 * 60 * 1000; // 24 hours

		for (const [id, suggestion] of this.suggestions.entries()) {
			if (suggestion.created < cutoff) {
				this.suggestions.delete(id);
			}
		}
	}

	// Public API for UI components

	/**
	 * Applies a specific layout suggestion.
	 * @public
	 * @param {string} suggestionId - The ID of the suggestion to apply.
	 * @returns {Promise<void>}
	 * @throws {Error} If the suggestion is not found or the action is unknown.
	 */
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
					throw new Error(
						`Unknown suggestion action: ${suggestion.action}`
					);
			}

			// Mark as applied and emit event
			suggestion.applied = true;
			this.stateManager?.emit?.("aiSuggestionApplied", {
				suggestionId,
				suggestion,
			});
		} catch (error) {
			console.error("Failed to apply AI suggestion:", error);
			throw error;
		}
	}

	/**
	 * Dismisses a suggestion, preventing it from being shown again in the current session.
	 * @public
	 * @param {string} suggestionId - The ID of the suggestion to dismiss.
	 */
	dismissSuggestion(suggestionId) {
		const suggestion = this.suggestions.get(suggestionId);
		if (suggestion) {
			suggestion.dismissed = true;
			this.stateManager?.emit?.("aiSuggestionDismissed", {
				suggestionId,
			});
		}
	}

	/**
	 * Retrieves the current list of active, non-dismissed suggestions.
	 * @public
	 * @returns {object[]} An array of active suggestion objects.
	 */
	getActiveSuggestions() {
		return Array.from(this.suggestions.values())
			.filter((s) => !s.dismissed && !s.applied)
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, this.options.maxSuggestions);
	}

	// Future implementation methods (stubs for now)

	/**
	 * Placeholder for applying position suggestions.
	 * @private
	 * @param {object} suggestion - The suggestion object.
	 */
	async applySuggestedPositions(suggestion) {
		// Future: Apply optimal positions based on usage patterns
		console.log("Applying suggested positions:", suggestion.blocks);
	}

	/**
	 * Placeholder for applying grouping suggestions.
	 * @private
	 * @param {object} suggestion - The suggestion object.
	 */
	async applySuggestedGrouping(suggestion) {
		// Future: Group related blocks together
		console.log("Applying suggested grouping:", suggestion.blocks);
	}

	/**
	 * Placeholder for applying size suggestions.
	 * @private
	 * @param {object} suggestion - The suggestion object.
	 */
	async applySuggestedSizes(suggestion) {
		// Future: Apply optimal sizes based on content analysis
		console.log("Applying suggested sizes:", suggestion.blocks);
	}

	/**
	 * Clears all current suggestions.
	 * @public
	 */
	clearSuggestions() {
		this.suggestions.clear();
		this.stateManager?.emit?.("aiSuggestionsCleared");
	}

	// Analytics and monitoring

	/**
	 * Retrieves analytics data about the assistant's state and activity.
	 * @public
	 * @returns {object} An object containing analytics data.
	 */
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
/**
 * @class AISuggestionPanel
 * @classdesc A placeholder UI component for displaying AI-generated layout suggestions.
 * This class is intended for future implementation.
 */
export class AISuggestionPanel {
	/**
	 * Creates an instance of AISuggestionPanel.
	 * @param {AILayoutAssistant} assistant - The AI Layout Assistant instance.
	 */
	constructor(assistant) {
		this.assistant = assistant;
		this.setupEventListeners();
	}

	/**
	 * Sets up event listeners for receiving new suggestions.
	 * @private
	 */
	setupEventListeners() {
		// This component is instantiated by CompleteGridSystem, which has the stateManager
		this.assistant.stateManager?.on?.(
			"aiLayoutSuggestions",
			this.onSuggestionsReceived.bind(this)
		);
	}

	/**
	 * Handles the receipt of new layout suggestions.
	 * @private
	 * @param {object} data - The event data containing the suggestions.
	 */
	onSuggestionsReceived(data) {
		// Future: Show suggestion panel in UI
		console.log("AI suggestions available:", data.suggestions);

		// Could integrate with existing notification system
		if (typeof showGridToast !== "undefined") {
			showGridToast(
				`💡 ${data.suggestions.length} layout suggestions available`,
				"info",
				5000
			);
		}
	}

	// Future: Render suggestion UI
	/**
	 * Renders the suggestion panel UI.
	 * @returns {HTMLElement} A placeholder div element.
	 */
	render() {
		// Placeholder for future UI implementation
		return document.createElement("div");
	}
}

export default AILayoutAssistant;
