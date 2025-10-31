/**
 * @namespace ErrorHelpers
 * @description A collection of utility functions for comprehensive error handling.
 * This includes normalizing errors into a standard format, categorizing them,
 * reporting them to various sinks (console, event flow), and attempting recovery actions.
 */
import { DateCore } from "./DateUtils.js";

/**
 * @class AppError
 * @description A base class for all custom application errors, ensuring consistent properties.
 * @extends Error
 */
export class AppError extends Error {
	constructor(
		message,
		{
			category = "system_error",
			severity = "medium",
			recoverable = true,
			showToUser = true,
			idManager, // Expect an IdManager instance
			...context
		} = {}
	) {
		super(message);
		this.name = this.constructor.name; // Use a simple, non-secure ID for errors
		this.id = idManager
			? idManager.generateSimpleId("err")
			: `err_${DateCore.timestamp()}`;
		this.timestamp = DateCore.now();
		this.category = category;
		this.severity = severity;
		this.recoverable = recoverable;
		this.showToUser = showToUser;
		this.context = context;
	}
}

// --- Specific Custom Error Classes ---
export class UIError extends AppError {
	constructor(message, context) {
		super(message, { category: "ui_error", ...context });
	}
}
export class NetworkError extends AppError {
	constructor(message, context) {
		super(message, {
			category: "network_error",
			severity: "high",
			...context,
		});
	}
}
export class StorageError extends AppError {
	constructor(message, context) {
		super(message, {
			category: "storage_error",
			severity: "high",
			...context,
		});
	}
}
export class PolicyError extends AppError {
	constructor(message, context) {
		super(message, {
			category: "policy_error",
			severity: "high",
			showToUser: true,
			...context,
		});
	}
}
export class PluginError extends AppError {
	constructor(message, context) {
		super(message, { category: "plugin_error", ...context });
	}
}

export const ErrorHelpers = {
	/**
	 * Normalizes an error of any type (Error, string, object) into a standardized structure.
	 * This adds a unique ID, timestamp, severity, category, and other contextual information.
	 * @param {Error|string|object} error - The raw error to be formatted.
	 * @param {object} [context={}] - Additional context to enrich the error object (e.g., component name, user ID).
	 * @returns {object} A standardized error object with properties like `id`, `message`, `stack`, `category`, `severity`, etc.
	 */
	formatError(error, context = {}) {
		const idManager = context.managers?.idManager;
		// If it's already one of our custom errors, enrich it
		if (error instanceof AppError) {
			const enrichedError = { ...error, ...error.context, ...context };
			enrichedError.userFriendlyMessage =
				this.generateUserFriendlyMessage(enrichedError);
			return enrichedError;
		}

		// Handle other error types and normalize them
		const formattedError = new AppError("Unknown error occurred", {
			category: "unknown",
			idManager,
			...context,
		});

		if (error instanceof Error) {
			// Standard JavaScript Error
			formattedError.message = error.message;
			formattedError.stack = error.stack || "No stack available";
			formattedError.name = error.name;
			// Use legacy categorization as a fallback
			formattedError.category = this.categorizeError(error);
			formattedError.severity = this.determineSeverity(error);
		} else if (typeof error === "string") {
			// Plain string error
			formattedError.message = error;
			formattedError.stack = "No stack available";
		} else if (typeof error === "object" && error !== null) {
			// Plain object error
			Object.assign(formattedError, error); // Merge properties
			formattedError.message = error.message || formattedError.message;
			formattedError.stack = error.stack || "No stack available";
		}

		// Generate user-friendly message for the newly formatted error
		formattedError.userFriendlyMessage =
			this.generateUserFriendlyMessage(formattedError);

		return formattedError;
	},

	/**
	 * Generates a user-friendly message based on the error's category and severity.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @returns {string} A user-friendly message suitable for display in the UI.
	 */
	generateUserFriendlyMessage(error) {
		const category = error.category;
		const severity = error.severity;

		const messages = {
			ui_error: {
				high: "The interface encountered a serious problem. Please refresh the page.",
				medium: "There was an issue with the interface. Some features may not work properly.",
				low: "A minor interface issue occurred. You can continue working normally.",
			},
			network_error: {
				high: "Unable to connect to the server. Please check your internet connection.",
				medium: "Connection issues detected. Some data may not be up to date.",
				low: "Network request failed. Please try again.",
			},
			storage_error: {
				high: "Unable to save your data. Please ensure you have sufficient storage space.",
				medium: "There was an issue saving your changes. Please try again.",
				low: "A storage issue occurred. Your recent changes may not be saved.",
			},
			policy_error: {
				high: "You do not have permission to perform this action.",
				medium: "Access restricted. Please contact an administrator.",
				low: "This feature is not available with your current permissions.",
			},
			plugin_error: {
				high: "A plugin has stopped working. Some features may be unavailable.",
				medium: "Plugin issue detected. Functionality may be limited.",
				low: "A plugin encountered a minor issue.",
			},
			javascript_error: {
				high: "A serious application error occurred. Please refresh the page.",
				medium: "An application error occurred. Some features may not work properly.",
				low: "A minor application issue occurred.",
			},
			system_error: {
				high: "A system error occurred. Please contact support if this persists.",
				medium: "System issue detected. Some features may be affected.",
				low: "A minor system issue occurred.",
			},
		};

		return (
			messages[category]?.[severity] ||
			"An unexpected error occurred. Please try again."
		);
	},

	/**
	 * Logs a formatted error object to the console in a structured, grouped format.
	 * @param {object} errorObj - The formatted error object to log.
	 * @returns {void}
	 */
	logToConsole(errorObj) {
		const { id, message, category, severity, stack, component } = errorObj;

		console.group(
			`❌ [${severity.toUpperCase()}] ${category} in ${component}`
		);
		console.error(`ID: ${id}`);
		console.error(`Message: ${message}`);
		console.error(`Stack trace:`);
		console.error(stack);
		console.groupEnd();
	},

	/**
	 * Emits a formatted error to the EventFlowEngine for centralized processing,
	 * such as displaying UI notifications or sending to an external logging service.
	 * @param {object} eventFlow - The EventFlowEngine instance.
	 * @param {Error|string|object} error - The raw error to emit.
	 * @param {object} [context={}] - Additional context for the error event.
	 * @param {import('../core/HybridStateManager.js').default} [context.stateManager] - The state manager instance.
	 */
	emitToFlow(error, context = {}) {
		const stateManager = context.stateManager;
		if (!stateManager?.emit) {
			console.warn(
				"[ErrorHelpers] EventFlow not available, cannot emit error"
			);
			return;
		}

		try {
			stateManager.emit("error", error);
		} catch (emitError) {
			console.error(
				"[ErrorHelpers] Failed to emit error to EventFlow:",
				emitError
			);
			this.logToConsole(error);
		}
	},

	/**
	 * A wrapper for async functions that catches any thrown errors and processes them
	 * through the standard `handleError` pipeline.
	 * @param {function(): Promise<any>} fn - The async function to execute.
	 * @param {object} [context={}] - Context for the error if one occurs.
	 * @param {import('../core/HybridStateManager.js').default} [context.stateManager] - The state manager instance.
	 * @returns {Promise<any|null>} The result of the function, or `null` if an error was caught.
	 */
	async tryAsync(fn, context = {}) {
		try {
			return await fn();
		} catch (error) {
			this.handleError(error, context);
			return null;
		}
	},

	/**
	 * A wrapper for synchronous functions that catches any thrown errors and processes them
	 * through the standard `handleError` pipeline.
	 * @param {function(): any} fn - The synchronous function to execute.
	 * @param {object} [context={}] - Context for the error if one occurs.
	 * @param {import('../core/HybridStateManager.js').default} [context.stateManager] - The state manager instance.
	 * @returns {any|null} The result of the function, or `null` if an error was caught.
	 */
	try(fn, context = {}) {
		try {
			return fn();
		} catch (error) {
			this.handleError(error, context);
			return null;
		}
	},

	/**
	 * The main error handling pipeline. It formats the error, logs it to the console,
	 * emits it to the event flow, and attempts recovery.
	 * @param {Error|string|object} error - The raw error to handle.
	 * @param {object} [context={}] - Additional context for the error.
	 * @param {import('../core/HybridStateManager.js').default} [context.stateManager] - The state manager instance.
	 * @returns {object} The formatted error object.
	 */
	handleError(error, context = {}) {
		// Ensure managers from context are available for integrations
		const formattedError = this.formatError(error, context);
		const { category, severity, component } = formattedError;

		// 1. Always log to console for immediate debugging
		this.logToConsole(formattedError);

		// 2. Metrics Integration: Record error stats.
		// V8.0 Parity: Derive dependencies directly from stateManager.
		const stateManager = context.stateManager;
		const metrics = stateManager?.metricsRegistry;

		if (metrics) {
			metrics.increment("errors.total");
			if (category) metrics.increment(`errors.by_category.${category}`);
			if (severity) metrics.increment(`errors.by_severity.${severity}`);
			if (component)
				metrics.increment(`errors.by_component.${component}`);
		}

		// 3. Auditing, Security & Embedding Integration (using full context)
		if (stateManager) {
			// For high-severity errors, create a formal audit trail
			if (severity === "high" && stateManager.managers?.forensicLogger) {
				const securityContext =
					stateManager.managers.securityManager?.getSubject() || {};
				stateManager.managers.forensicLogger.logAuditEvent(
					"SYSTEM_ERROR_CRITICAL",
					this.sanitizeError(formattedError),
					securityContext
				);
			}
			// For storage errors, capture cache metrics for context
			if (
				category === "storage_error" &&
				stateManager.managers?.cacheManager
			) {
				formattedError.context.cacheMetrics =
					stateManager.managers.cacheManager.getMetrics();
			}
			// For high-severity errors, generate embeddings for AI analysis
			if (severity === "high" && stateManager.managers?.embedding) {
				// We pass the full error context to get a rich embedding
				const embeddingText = `Error: ${formattedError.message}. Category: ${category}. Component: ${component}. Stack: ${formattedError.stack}`;
				stateManager.managers.embedding
					.generateEmbedding(embeddingText, {
						// Use the correct manager name 'embedding' as per HybridStateManager
						errorId: formattedError.id,
						type: "error_context",
					})
					.catch((e) =>
						console.warn("Failed to generate error embedding:", e)
					);
			}
		}

		// 4. Emit to EventFlow for UI notifications and other listeners
		this.emitToFlow(formattedError, context);

		// 5. Attempt recovery if possible
		if (formattedError.recoverable) {
			this.attemptRecovery(formattedError, context);
		}

		return formattedError;
	},

	/**
	 * Dispatches to a specific recovery strategy based on the error's category.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @param {object} context - The context, which may contain recovery functions (e.g., `refreshComponent`).
	 */
	attemptRecovery(error, context = {}) {
		switch (error.category) {
			case "ui_error":
				this.recoverUIError(error, context);
				break;
			case "network_error":
				this.recoverNetworkError(error, context);
				break;
			case "storage_error":
				this.recoverStorageError(error, context);
				break;
			case "policy_error":
				this.recoverPolicyError(error, context);
				break;
			default:
				console.warn(
					`[ErrorHelpers] No recovery strategy for ${error.category}`
				);
		}
	},

	/**
	 * A recovery strategy for UI-related errors. Attempts to refresh the affected component.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @param {object} context - The context containing a `refreshComponent` function.
	 */
	recoverUIError(error, context) {
		// Try to refresh the affected component
		if (context.component && context.refreshComponent) {
			try {
				context.refreshComponent(context.component);
				console.info(
					`[ErrorHelpers] Attempted to refresh component: ${context.component}`
				);
			} catch (recoveryError) {
				console.warn(
					"[ErrorHelpers] Component refresh failed:",
					recoveryError
				);
			}
		}
	},

	/**
	 * A recovery strategy for network errors. Attempts to enable an offline mode if available.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @param {object} context - The context containing an `enableOfflineMode` function.
	 */
	recoverNetworkError(error, context) {
		// Enable offline mode or use cached data
		if (context.enableOfflineMode) {
			try {
				context.enableOfflineMode();
				console.info(
					"[ErrorHelpers] Enabled offline mode due to network error"
				);
			} catch (recoveryError) {
				console.warn(
					"[ErrorHelpers] Failed to enable offline mode:",
					recoveryError
				);
			}
		}
	},

	/**
	 * A recovery strategy for storage errors. Attempts to clear a cache if available.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @param {object} context - The context containing a `clearCache` function.
	 */
	recoverStorageError(error, context) {
		// Clear cache or use alternative storage
		if (context.clearCache) {
			try {
				context.clearCache();
				console.info(
					"[ErrorHelpers] Cleared cache due to storage error"
				);
			} catch (recoveryError) {
				console.warn(
					"[ErrorHelpers] Failed to clear cache:",
					recoveryError
				);
			}
		}
	},

	/**
	 * A recovery strategy for policy/permission errors. Logs that recovery should be handled by the UI.
	 * @private
	 * @param {object} error - The formatted error object.
	 * @param {object} context - The error context.
	 */
	recoverPolicyError(error, context) {
		// Show permission dialog or redirect to login
		console.info(
			"[ErrorHelpers] Policy error - user may need different permissions"
		);
		// Recovery would be handled by the UI layer
	},

	/**
	 * Creates a simple error boundary object for a component.
	 * This provides `try` and `tryAsync` methods that wrap functions with error handling.
	 * @param {object} [context={}] - The full context, including managers and component name.
	 * @param {import('../core/HybridStateManager.js').default} [context.stateManager] - The state manager instance.
	 * @returns {{try: function(function(): any): any, tryAsync: function(function(): Promise<any>): Promise<any>}} An error boundary object.
	 */
	createErrorBoundary(context = {}, component = "unknown") {
		return {
			try: (fn) => this.try(fn, { component, ...context }),
			tryAsync: (fn) => {
				return this.tryAsync(fn, {
					component,
					...context,
				});
			},
		};
	},

	/**
	 * Attaches global error listeners to `window` for uncaught exceptions and
	 * unhandled promise rejections, piping them through the standard error handling pipeline.
	 * @param {object} [context={}] - The context object, containing the stateManager.
	 */
	setupGlobalHandlers(context = {}) {
		// Handle uncaught errors
		window.addEventListener("error", (event) => {
			this.handleError(event.error || event.message, {
				component: "global",
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				...context,
			});
		});

		// Handle unhandled promise rejections
		window.addEventListener("unhandledrejection", (event) => {
			this.handleError(event.reason, {
				component: "global",
				type: "unhandled_promise_rejection",
			});
		});

		console.log("[ErrorHelpers] Global error handlers set up");
	},

	/**
	 * A higher-order function that wraps an async function to track its execution time.
	 * It logs a warning for slow operations and enriches any errors with performance data.
	 * @param {function(...any): Promise<any>} fn - The async function to wrap.
	 * @param {string} [operation="operation"] - A name for the operation being tracked.
	 * @param {object} [context={}] - The context to pass to the error handler.
	 * @returns {function(...any): Promise<any>} The wrapped, performance-aware function.
	 */
	withPerformanceTracking(fn, operation = "operation", context = {}) {
		return async (...args) => {
			// The function being wrapped might have its own context, so we accept it here.
			const startTime = DateCore.timestamp();
			try {
				const result = await fn(...args);
				const duration = DateCore.timestamp() - startTime;

				// Log slow operations
				if (duration > 100) {
					console.warn(
						`[ErrorHelpers] Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`
					);
				}

				return result;
			} catch (error) {
				const duration = DateCore.timestamp() - startTime;
				// Enrich the original error instead of wrapping it in a new one
				const enrichedError = this.formatError(error, {
					// Pass full context
					...context,
					operation,
					duration: duration.toFixed(2),
					performance_issue: duration > 100,
				});
				throw enrichedError;
			}
		};
	},

	/**
	 * Sanitizes an error object to remove potentially sensitive information (PII)
	 * like emails or credit card numbers before logging or reporting.
	 * @param {object} error - The formatted error object.
	 * @returns {object|null} The sanitized error object, or null if the input was invalid.
	 */
	sanitizeError(error) {
		if (!error) return null;

		// Remove sensitive information
		const sanitized = { ...error };

		// Remove potential PII from error messages
		if (sanitized.message) {
			sanitized.message = sanitized.message
				.replace(
					/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
					"[EMAIL]"
				)
				.replace(
					/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
					"[CARD]"
				)
				.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
		}

		// Limit stack trace length
		if (sanitized.stack && sanitized.stack.length > 2000) {
			sanitized.stack =
				sanitized.stack.substring(0, 2000) + "... [truncated]";
		}

		return sanitized;
	},

	/**
	 * A robust wrapper for executing functions with error handling, a default return value, and a finally block.
	 * @param {Function} fn - The function to execute. Can be sync or async.
	 * @param {Function|any} [onErrorOrValue=null] - A function to call on error, or a default value to return.
	 * @param {object} [context={}] - Context for the error if one occurs.
	 * @param {Function} [onFinally=null] - A function to call in the finally block.
	 * @returns {Promise<any>} The result of the function, or the result of onErrorOrValue.
	 */
	async tryOr(fn, onErrorOrValue = null, context = {}, onFinally = null) {
		try {
			return await Promise.resolve(fn());
		} catch (error) {
			this.handleError(error, context);
			if (typeof onErrorOrValue === "function") {
				return onErrorOrValue(error);
			}
			return onErrorOrValue;
		} finally {
			if (typeof onFinally === "function") {
				try {
					onFinally();
				} catch (finallyError) {
					this.handleError(finallyError, {
						...context,
						component: context.component
							? `${context.component}.finally`
							: "finally_block",
						originalError: context.error,
					});
				}
			}
		}
	},
};

export default ErrorHelpers;
