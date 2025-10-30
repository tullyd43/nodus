/**
 * @file ErrorHelpers_EventFlow.js
 * @description Enhanced error handling utilities that integrate with the EventFlowEngine for centralized, flow-driven error processing.
 */

import { GridToastManager } from "../grid/GridToastManager.js";

/**
 * @class ErrorHelpers
 * @classdesc Provides a suite of static methods for formatting, categorizing, and reporting errors through the EventFlowEngine.
 * It includes features like error deduplication, context extraction, and security-conscious logging.
 */
export class ErrorHelpers {
	/** @type {import('./EventFlowEngine.js').EventFlowEngine | null} */
	static eventFlow = null;
	/** @type {Map<string, number>} */
	static errorCache = new Map(); // For deduplication
	/** @type {object} */
	static config = {
		enableDeduplication: true,
		deduplicationWindow: 60000, // 1 minute
		maxCacheSize: 100,
		enableDetailedLogging: false,
	};

	/**
	 * Initializes the ErrorHelpers with a reference to the EventFlowEngine and an optional configuration.
	 * @static
	 * @param {import('./EventFlowEngine.js').EventFlowEngine} eventFlow - The application's EventFlowEngine instance.
	 * @param {object} [config={}] - Configuration overrides.
	 */
	static initialize(eventFlow, config = {}) {
		this.eventFlow = eventFlow;
		this.config = { ...this.config, ...config };

		// Set up cleanup interval for error cache
		setInterval(() => this.cleanupErrorCache(), 300000); // 5 minutes
	}

	/**
	 * The main entry point for handling an error. It formats the error, checks for duplicates,
	 * and emits it through the EventFlowEngine for processing.
	 * @static
	 * @param {Error} error - The error object to handle.
	 * @param {object} [context={}] - Additional context about where the error occurred.
	 * @returns {Promise<object|null>} A promise that resolves with the formatted error data, or null if the error was deduplicated.
	 */
	static async handleError(error, context = {}) {
		try {
			// Format the error
			const errorData = this.formatError(error, context);

			// Check if we should process this error
			if (!this.shouldReport(errorData)) {
				return null;
			}

			// Store for deduplication
			this.storeError(errorData);

			// Emit through EventFlow instead of console
			await this.emitErrorFlow(errorData);

			return errorData;
		} catch (handlingError) {
			// Fallback to console if error handling itself fails
			console.error("Error in error handling:", handlingError);
			console.error("Original error:", error);
			return null;
		}
	}

	/**
	 * Emits a formatted error through the EventFlow system, triggering various error-related events.
	 * @static
	 * @param {object} errorData - The formatted error object from `formatError`.
	 * @returns {Promise<void>}
	 */
	static async emitErrorFlow(errorData) {
		if (!this.eventFlow) {
			// Fallback to console if no EventFlow available
			console.error(
				"ErrorHelpers: No EventFlow configured, falling back to console"
			);
			console.error(errorData);
			return;
		}

		try {
			// Emit the primary error event
			await this.eventFlow.emit("error", {
				type: "error",
				level: errorData.level,
				source: "error_helpers",
				data: errorData,
				timestamp: new Date().toISOString(),
			});

			// Emit specific error type events for targeted handling
			if (errorData.type === "NetworkError") {
				await this.eventFlow.emit("network_error", errorData);
			} else if (errorData.type === "ValidationError") {
				await this.eventFlow.emit("validation_error", errorData);
			} else if (errorData.level === "critical") {
				await this.eventFlow.emit("critical_error", errorData);
			}

			// Emit audit event for security tracking
			await this.eventFlow.emit("audit_event", {
				type: "error_processed",
				errorId: errorData.id,
				level: errorData.level,
				fingerprint: errorData.fingerprint,
				timestamp: new Date().toISOString(),
			});
		} catch (emitError) {
			console.error("Failed to emit error through EventFlow:", emitError);
			console.error("Original error data:", errorData);
		}
	}

	/**
	 * Parses a raw Error object and additional context into a standardized, structured error object.
	 * @static
	 * @param {Error} error - The raw error object.
	 * @param {object} [context={}] - Additional context to include.
	 * @returns {object} A standardized error data object.
	 */
	static formatError(error, context = {}) {
		const errorData = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			message: error.message || "Unknown error",
			type: error.constructor.name || "Error",
			stack: error.stack || "",
			level: this.categorizeError(error),
			context: this.extractContext(error, context),
			fingerprint: this.generateFingerprint(error),
			metadata: {
				userAgent: navigator.userAgent,
				url: window.location.href,
				timestamp: Date.now(),
			},
		};

		// Additional parsing for specific error types
		if (error.name === "ValidationError") {
			errorData.validationErrors = error.errors || [];
			errorData.field = error.field;
			errorData.value = error.value;
		}

		if (error.name === "NetworkError" || error.code === "NETWORK_ERROR") {
			errorData.networkInfo = {
				url: error.url,
				status: error.status,
				statusText: error.statusText,
				method: error.method || "GET",
			};
		}

		if (error.name === "DatabaseError") {
			errorData.databaseInfo = {
				query: error.query,
				table: error.table,
				operation: error.operation,
			};
		}

		// Security error handling
		if (error.name === "SecurityError" || error.name === "AuthError") {
			errorData.securityInfo = {
				action: error.action,
				resource: error.resource,
				userId: error.userId,
				// Don't log sensitive details
				sanitized: true,
			};
		}

		return errorData;
	}

	/**
	 * Categorizes an error into a severity level ('critical', 'high', 'medium', 'low') based on its type and message.
	 * @static
	 * @param {Error} error - The error object to categorize.
	 * @returns {'critical'|'high'|'medium'|'low'} The determined severity level.
	 */
	static categorizeError(error) {
		const message = error.message?.toLowerCase() || "";
		const type = error.constructor.name || "";
		const code = error.code || "";

		// Critical errors - system-threatening
		if (
			type.includes("Fatal") ||
			message.includes("fatal") ||
			message.includes("critical") ||
			message.includes("crash") ||
			code === "SYSTEM_FAILURE"
		) {
			return "critical";
		}

		// High priority errors - security or data integrity
		if (
			type.includes("Security") ||
			type.includes("Auth") ||
			message.includes("unauthorized") ||
			message.includes("forbidden") ||
			message.includes("permission") ||
			message.includes("csrf") ||
			code === "SECURITY_VIOLATION"
		) {
			return "high";
		}

		// Medium priority errors - functionality impacted
		if (
			type.includes("Validation") ||
			type.includes("Network") ||
			message.includes("timeout") ||
			message.includes("connection") ||
			message.includes("not found") ||
			code === "OPERATION_FAILED"
		) {
			return "medium";
		}

		// Low priority errors - minor issues
		if (
			type.includes("Warning") ||
			message.includes("deprecated") ||
			message.includes("minor") ||
			code === "DEPRECATION_WARNING"
		) {
			return "low";
		}

		return "medium"; // Default to medium for unknown errors
	}

	/**
	 * Extracts useful context from the environment and the error object itself, while attempting to avoid sensitive data.
	 * @static
	 * @param {Error} error - The error object.
	 * @param {object} [additionalContext={}] - Any extra context provided by the caller.
	 * @returns {object} A context object with environment and error details.
	 */
	static extractContext(error, additionalContext = {}) {
		const context = {
			url: window.location.href,
			userAgent: navigator.userAgent,
			timestamp: Date.now(),
			sessionId: this.getSessionId(),
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
			},
			connection: navigator.connection
				? {
						effectiveType: navigator.connection.effectiveType,
						downlink: navigator.connection.downlink,
					}
				: null,
		};

		// Add additional context while protecting sensitive data
		Object.keys(additionalContext).forEach((key) => {
			if (!this.isSensitiveField(key)) {
				context[key] = additionalContext[key];
			}
		});

		// Extract from error object safely
		if (error.context) {
			Object.keys(error.context).forEach((key) => {
				if (!this.isSensitiveField(key)) {
					context[key] = error.context[key];
				}
			});
		}

		// Extract from stack trace
		const stackContext = this.parseStackTrace(error.stack);
		if (stackContext) {
			context.stackInfo = stackContext;
		}

		return context;
	}

	/**
	 * Checks if a field name suggests it might contain sensitive data.
	 * @static
	 * @param {string} fieldName - The name of the field to check.
	 * @returns {boolean} True if the field name matches a list of sensitive keywords.
	 */
	static isSensitiveField(fieldName) {
		const sensitiveFields = [
			"password",
			"token",
			"secret",
			"key",
			"auth",
			"ssn",
			"credit",
			"bank",
			"account",
			"pin",
			"private",
			"confidential",
			"secure",
		];

		const field = fieldName.toLowerCase();
		return sensitiveFields.some((sensitive) => field.includes(sensitive));
	}

	/**
	 * Generates a consistent "fingerprint" for an error based on its message, type, and stack trace.
	 * This is used for deduplicating identical errors that occur in rapid succession.
	 * @static
	 * @param {Error} error - The error object.
	 * @returns {string} A hash-like string representing the error's fingerprint.
	 */
	static generateFingerprint(error) {
		const components = [
			error.message || "",
			error.constructor.name || "",
			this.getCleanStackTrace(error.stack),
		];

		// Simple hash of concatenated components
		const combined = components.join("|");
		let hash = 0;
		for (let i = 0; i < combined.length; i++) {
			const char = combined.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		return Math.abs(hash).toString(36);
	}

	/**
	 * Parses a stack trace string into a structured array of stack frames.
	 * @static
	 * @param {string} stack - The stack trace string.
	 * @returns {object[]|null} An array of parsed stack frame objects, or null if the stack is empty.
	 */
	static parseStackTrace(stack) {
		if (!stack) return null;

		const lines = stack.split("\n");
		const parsed = [];

		for (const line of lines) {
			const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
			if (match) {
				parsed.push({
					function: match[1],
					file: match[2],
					line: parseInt(match[3]),
					column: parseInt(match[4]),
				});
			}
		}

		return parsed.slice(0, 5); // Top 5 stack frames
	}

	/**
	 * Cleans a stack trace by removing line/column numbers to create a more stable fingerprint.
	 * @static
	 * @param {string} stack - The stack trace string.
	 * @returns {string} A cleaned stack trace string.
	 */
	static getCleanStackTrace(stack) {
		if (!stack) return "";

		return stack
			.split("\n")
			.slice(0, 3) // Top 3 lines
			.map((line) => line.replace(/:\d+:\d+/g, "")) // Remove line numbers
			.join("|");
	}

	/**
	 * Determines whether an error should be reported based on its severity, type, and deduplication status.
	 * @static
	 * @param {object} errorData - The formatted error data object.
	 * @returns {boolean} True if the error should be reported, false if it should be skipped.
	 */
	static shouldReport(errorData) {
		const { level, fingerprint, message, type } = errorData;

		// Always report critical errors
		if (level === "critical") return true;

		// Skip known development/browser errors
		const ignoredErrors = [
			"Script error",
			"Non-Error promise rejection captured",
			"ResizeObserver loop limit exceeded",
			"Network request failed", // Common in offline scenarios
		];

		if (ignoredErrors.some((ignored) => message.includes(ignored))) {
			return false;
		}

		// Skip certain error types in production
		if (process.env.NODE_ENV === "production") {
			const devOnlyErrors = ["Warning", "DeprecationWarning"];
			if (devOnlyErrors.includes(type)) {
				return false;
			}
		}

		// Check deduplication cache
		if (this.config.enableDeduplication) {
			const cacheKey = `${fingerprint}-${level}`;
			const lastSeen = this.errorCache.get(cacheKey);

			if (
				lastSeen &&
				Date.now() - lastSeen < this.config.deduplicationWindow
			) {
				return false; // Skip duplicate within time window
			}
		}

		return true;
	}

	/**
	 * Stores an error's fingerprint in the cache to track for deduplication.
	 * @static
	 * @param {object} errorData - The formatted error data.
	 */
	static storeError(errorData) {
		if (!this.config.enableDeduplication) return;

		const cacheKey = `${errorData.fingerprint}-${errorData.level}`;
		this.errorCache.set(cacheKey, Date.now());

		// Trim cache if it gets too large
		if (this.errorCache.size > this.config.maxCacheSize) {
			const entries = Array.from(this.errorCache.entries());
			entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp

			// Remove oldest 20% of entries
			const toRemove = Math.floor(entries.length * 0.2);
			for (let i = 0; i < toRemove; i++) {
				this.errorCache.delete(entries[i][0]);
			}
		}
	}

	/**
	 * Periodically cleans up old entries from the error cache to prevent memory leaks.
	 * @static
	 * @private
	 */
	static cleanupErrorCache() {
		const now = Date.now();
		const cutoff = now - this.config.deduplicationWindow;

		for (const [key, timestamp] of this.errorCache.entries()) {
			if (timestamp < cutoff) {
				this.errorCache.delete(key);
			}
		}
	}

	/**
	 * Creates a structured notification object from formatted error data, suitable for a UI toast or dialog manager.
	 * @static
	 * @param {object} errorData - The formatted error data.
	 * @returns {object} A notification object.
	 */
	static createNotification(errorData) {
		const display = this.formatForDisplay(errorData);

		return {
			id: errorData.id,
			type: "error",
			level: errorData.level,
			title: display.title,
			message: display.subtitle,
			details: display.details,
			actions: this.getErrorActions(errorData),
			persistent: errorData.level === "critical",
			timeout: this.getNotificationTimeout(errorData.level),
			metadata: {
				errorId: errorData.id,
				fingerprint: errorData.fingerprint,
				timestamp: errorData.timestamp,
			},
		};
	}

	/**
	 * Formats key parts of an error for user-facing display.
	 * @static
	 * @param {object} errorData - The formatted error data.
	 * @returns {{emoji: string, title: string, subtitle: string, details: string}} An object with display-ready strings.
	 */
	static formatForDisplay(errorData) {
		const { level, message, type, timestamp, context } = errorData;

		const levelEmojis = {
			critical: "🚨",
			high: "⚠️",
			medium: "⚡",
			low: "ℹ️",
		};

		return {
			emoji: levelEmojis[level] || "⚠️",
			title: `${type}: ${message}`,
			subtitle: `at ${new Date(timestamp).toLocaleTimeString()}`,
			details: context?.stackInfo
				? `in ${context.stackInfo[0]?.function || "unknown function"}`
				: "No stack trace available",
		};
	}

	/**
	 * Determines a set of appropriate user actions for a given error (e.g., "Dismiss", "Retry", "Report").
	 * @static
	 * @param {object} errorData - The formatted error data.
	 * @returns {object[]} An array of action objects.
	 */
	static getErrorActions(errorData) {
		const actions = [
			{
				label: "Dismiss",
				action: "dismiss",
				style: "secondary",
			},
		];

		// Add report action for high/critical errors
		if (["critical", "high"].includes(errorData.level)) {
			actions.unshift({
				label: "Report",
				action: "report",
				style: "primary",
				data: { errorId: errorData.id },
			});
		}

		// Add retry action for network errors
		if (errorData.type.includes("Network") || errorData.networkInfo) {
			actions.unshift({
				label: "Retry",
				action: "retry",
				style: "primary",
				data: { errorId: errorData.id },
			});
		}

		// Add debug action for development
		if (this.config.enableDetailedLogging) {
			actions.push({
				label: "Debug",
				action: "debug",
				style: "tertiary",
				data: { errorData },
			});
		}

		return actions;
	}

	/**
	 * Gets a recommended display timeout for a notification based on the error's severity level.
	 * @static
	 * @param {string} level - The error's severity level.
	 * @returns {number} The recommended timeout in milliseconds (0 for persistent).
	 */
	static getNotificationTimeout(level) {
		const timeouts = {
			critical: 0, // No timeout - requires manual dismissal
			high: 15000, // 15 seconds
			medium: 8000, // 8 seconds
			low: 5000, // 5 seconds
		};

		return timeouts[level] || timeouts.medium;
	}

	/**
	 * Generates a comprehensive error report suitable for sending to an external logging or monitoring service.
	 * @static
	 * @param {object} errorData - The formatted error data.
	 * @returns {object} A detailed report object.
	 */
	static generateReport(errorData) {
		return {
			...errorData,
			reportedAt: new Date().toISOString(),
			environment: {
				url: window.location.href,
				userAgent: navigator.userAgent,
				viewport: {
					width: window.innerWidth,
					height: window.innerHeight,
				},
				connection: navigator.connection
					? {
							effectiveType: navigator.connection.effectiveType,
							downlink: navigator.connection.downlink,
						}
					: null,
			},
			performance: this.getPerformanceSnapshot(),
		};
	}

	/**
	 * Captures a snapshot of browser performance and memory metrics at the time of the error.
	 * @static
	 * @returns {object|null} A performance snapshot object, or null if the API is not available.
	 */
	static getPerformanceSnapshot() {
		if (!performance.memory) return null;

		return {
			memory: {
				used: performance.memory.usedJSHeapSize,
				total: performance.memory.totalJSHeapSize,
				limit: performance.memory.jsHeapSizeLimit,
			},
			timing: performance.timing
				? {
						navigationStart: performance.timing.navigationStart,
						loadEventEnd: performance.timing.loadEventEnd,
						domContentLoaded:
							performance.timing.domContentLoadedEventEnd,
					}
				: null,
		};
	}

	/**
	 * A utility method to get the current session ID.
	 * @static
	 * @returns {string} The session ID or 'anonymous'.
	 */
	static getSessionId() {
		return sessionStorage.getItem("sessionId") || "anonymous";
	}

	/**
	 * Gets statistics about the error handling system itself.
	 * @static
	 * @returns {{cacheSize: number, deduplicationEnabled: boolean, windowMs: number, eventFlowConnected: boolean}}
	 */
	static getErrorStatistics() {
		return {
			cacheSize: this.errorCache.size,
			deduplicationEnabled: this.config.enableDeduplication,
			windowMs: this.config.deduplicationWindow,
			eventFlowConnected: !!this.eventFlow,
		};
	}
}

/**
 * Attaches listeners to a HybridStateManager instance to display toast notifications for common errors.
 * @param {import('./HybridStateManager.js').HybridStateManager} stateManager - The state manager instance.
 */
export function attachErrorListeners(stateManager) {
	stateManager.on?.("validationError", ({ entity, errors }) => {
		GridToastManager?.show?.(
			`Validation error: ${entity?.id} • ${errors?.join(", ")}`
		);
	});
	stateManager.on?.("syncError", (err) => {
		GridToastManager?.show?.(`Sync failed: ${err?.message || err}`);
	});
	stateManager.on?.("accessDenied", ({ resource }) => {
		GridToastManager?.show?.(`Access denied for: ${resource}`);
	});
}

/**
 * Sets up global `window.onerror` and `window.onunhandledrejection` handlers
 * to automatically capture and process all uncaught exceptions through the ErrorHelpers.
 * @param {import('./EventFlowEngine.js').EventFlowEngine} eventFlow - The application's EventFlowEngine instance.
 * @param {object} [config={}] - Configuration for the ErrorHelpers.
 */
export function setupGlobalErrorHandling(eventFlow, config = {}) {
	ErrorHelpers.initialize(eventFlow, config);

	// Set up global error handlers
	window.addEventListener("error", (event) => {
		ErrorHelpers.handleError(event.error || new Error(event.message), {
			source: "global_error_handler",
			filename: event.filename,
			lineno: event.lineno,
			colno: event.colno,
		});
	});

	window.addEventListener("unhandledrejection", (event) => {
		const error =
			event.reason instanceof Error
				? event.reason
				: new Error(String(event.reason));

		ErrorHelpers.handleError(error, {
			source: "unhandled_promise_rejection",
			promise: event.promise,
		});
	});

	console.log("Global error handling configured with EventFlow integration");
}

/**
 * An example of declarative event flow definitions for handling errors.
 * @type {object[]}
 */
export const ERROR_FLOW_DEFINITIONS = [
	{
		id: "global_error_handler",
		name: "Global Error Handler",
		domain: "system",
		trigger: {
			type: "error",
		},
		conditions: [],
		actions: [
			{
				type: "show_notification",
				condition: "data.level !== 'low'",
				params: {
					title: "{{data.type}}: {{data.message}}",
					level: "{{data.level}}",
					timeout: "{{data.notificationTimeout}}",
				},
			},
			{
				type: "log_system_message",
				params: {
					level: "error",
					component: "error_handler",
					message: "Error processed: {{data.message}}",
					metadata: "{{data}}",
				},
			},
			{
				type: "emit_event",
				condition: "data.level === 'critical'",
				params: {
					type: "system_alert",
					data: {
						alertType: "critical_error",
						errorData: "{{data}}",
					},
				},
			},
		],
		metadata: {
			priority: 100,
			description:
				"Handles all application errors with EventFlow integration",
		},
	},
];

export default ErrorHelpers;
