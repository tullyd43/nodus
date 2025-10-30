/**
 * @namespace ErrorHelpers
 * @description A collection of utility functions for comprehensive error handling.
 * This includes normalizing errors into a standard format, categorizing them,
 * reporting them to various sinks (console, event flow), and attempting recovery actions.
 */

export const ErrorHelpers = {
	/**
	 * Normalizes an error of any type (Error, string, object) into a standardized structure.
	 * This adds a unique ID, timestamp, severity, category, and other contextual information.
	 * @param {Error|string|object} error - The raw error to be formatted.
	 * @param {object} [context={}] - Additional context to enrich the error object (e.g., component name, user ID).
	 * @returns {object} A standardized error object with properties like `id`, `message`, `stack`, `category`, `severity`, etc.
	 */
	formatError(error, context = {}) {
		const timestamp = new Date().toISOString();
		const errorId = this.generateErrorId();

		// Handle different error types
		let formattedError = {
			id: errorId,
			timestamp,
			severity: "medium",
			category: "unknown",
			recoverable: true,
			showToUser: true,
			component: context.component || "unknown",
			userId: context.userId || null,
			sessionId: context.sessionId || null,
			...context,
		};

		if (typeof error === "string") {
			formattedError.message = error;
			formattedError.stack = "No stack trace available";
		} else if (error instanceof Error) {
			formattedError.message = error.message;
			formattedError.stack = error.stack || "No stack trace available";
			formattedError.name = error.name;

			// Categorize based on error type
			formattedError.category = this.categorizeError(error);
			formattedError.severity = this.determineSeverity(error);
		} else if (typeof error === "object" && error !== null) {
			formattedError = { ...formattedError, ...error };
			formattedError.message = error.message || "Unknown error occurred";
			formattedError.stack = error.stack || "No stack trace available";
		} else {
			formattedError.message = "Unknown error occurred";
			formattedError.stack = "No stack trace available";
		}

		// Add user-friendly message
		formattedError.userFriendlyMessage =
			this.generateUserFriendlyMessage(formattedError);

		return formattedError;
	},

	/**
	 * Generates a unique identifier for an error instance.
	 * @private
	 * @returns {string} A unique error ID string, prefixed with `err_`.
	 */
	generateErrorId() {
		return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	},

	/**
	 * Analyzes an error's message and type to assign it a category.
	 * @private
	 * @param {Error} error - The error instance to categorize.
	 * @returns {string} The determined error category (e.g., 'ui_error', 'network_error', 'system_error').
	 */
	categorizeError(error) {
		const message = error.message.toLowerCase();
		const stack = error.stack.toLowerCase();

		// Grid-specific errors
		if (
			message.includes("grid") ||
			message.includes("layout") ||
			message.includes("drag") ||
			message.includes("resize")
		) {
			return "ui_error";
		}

		// Network errors
		if (
			message.includes("fetch") ||
			message.includes("network") ||
			message.includes("timeout")
		) {
			return "network_error";
		}

		// Database/storage errors
		if (
			message.includes("database") ||
			message.includes("storage") ||
			message.includes("index")
		) {
			return "storage_error";
		}

		// Permission/policy errors
		if (
			message.includes("permission") ||
			message.includes("access") ||
			message.includes("unauthorized")
		) {
			return "policy_error";
		}

		// Plugin errors
		if (
			message.includes("plugin") ||
			message.includes("extension") ||
			message.includes("manifest")
		) {
			return "plugin_error";
		}

		// JavaScript errors
		if (
			error.name === "TypeError" ||
			error.name === "ReferenceError" ||
			error.name === "SyntaxError"
		) {
			return "javascript_error";
		}

		return "system_error";
	},

	/**
	 * Determines the severity of an error based on its type and message content.
	 * @private
	 * @param {Error} error - The error instance to assess.
	 * @returns {string} The determined severity level ('high', 'medium', or 'low').
	 */
	determineSeverity(error) {
		const message = error.message.toLowerCase();

		// Critical errors that break core functionality
		if (
			message.includes("cannot read property") ||
			message.includes("is not a function") ||
			message.includes("failed to fetch") ||
			error.name === "ReferenceError"
		) {
			return "high";
		}

		// Medium errors that impact user experience
		if (
			message.includes("validation") ||
			message.includes("permission") ||
			message.includes("timeout")
		) {
			return "medium";
		}

		// Low errors that are recoverable
		return "low";
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
	 */
	emitToFlow(eventFlow, error, context = {}) {
		if (!eventFlow || typeof eventFlow.emit !== "function") {
			console.warn(
				"[ErrorHelpers] EventFlow not available, cannot emit error"
			);
			return;
		}

		const formattedError = this.formatError(error, context);

		try {
			eventFlow.emit("error", {
				...formattedError,
				errorMessage: formattedError.message,
				stackTrace: formattedError.stack,
				errorCategory: formattedError.category,
				userFriendlyMessage: formattedError.userFriendlyMessage,
				timestamp: formattedError.timestamp,
				operationId: context.operationId || null,
				cacheKey: context.cacheKey || null,
				requiredPermission: context.requiredPermission || null,
				recentUserActions: context.recentUserActions || [],
				systemState: context.systemState || {},
				gridState: context.gridState || null,
				userAgent: navigator.userAgent,
				pageUrl: window.location.href,
			});
		} catch (emitError) {
			console.error(
				"[ErrorHelpers] Failed to emit error to EventFlow:",
				emitError
			);
			this.logToConsole(formattedError);
		}
	},

	/**
	 * A wrapper for async functions that catches any thrown errors and processes them
	 * through the standard `handleError` pipeline.
	 * @param {function(): Promise<any>} fn - The async function to execute.
	 * @param {object} eventFlow - The EventFlowEngine instance to report errors to.
	 * @param {object} [context={}] - Context for the error if one occurs.
	 * @returns {Promise<any|null>} The result of the function, or `null` if an error was caught.
	 */
	async captureAsync(fn, eventFlow, context = {}) {
		try {
			return await fn();
		} catch (error) {
			this.handleError(error, eventFlow, context);
			return null;
		}
	},

	/**
	 * A wrapper for synchronous functions that catches any thrown errors and processes them
	 * through the standard `handleError` pipeline.
	 * @param {function(): any} fn - The synchronous function to execute.
	 * @param {object} eventFlow - The EventFlowEngine instance to report errors to.
	 * @param {object} [context={}] - Context for the error if one occurs.
	 * @returns {any|null} The result of the function, or `null` if an error was caught.
	 */
	captureSync(fn, eventFlow, context = {}) {
		try {
			return fn();
		} catch (error) {
			this.handleError(error, eventFlow, context);
			return null;
		}
	},

	/**
	 * The main error handling pipeline. It formats the error, logs it to the console,
	 * emits it to the event flow, and attempts recovery.
	 * @param {Error|string|object} error - The raw error to handle.
	 * @param {object} eventFlow - The EventFlowEngine instance.
	 * @param {object} [context={}] - Additional context for the error.
	 * @returns {object} The formatted error object.
	 */
	handleError(error, eventFlow, context = {}) {
		const formattedError = this.formatError(error, context);

		// Always log to console
		this.logToConsole(formattedError);

		// Emit to EventFlow if available
		if (eventFlow) {
			this.emitToFlow(eventFlow, formattedError, context);
		}

		// Attempt recovery if possible
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
				console.log(
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
				console.log(
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
				console.log(
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
				console.log(
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
		console.log(
			"[ErrorHelpers] Policy error - user may need different permissions"
		);
		// Recovery would be handled by the UI layer
	},

	/**
	 * Creates a simple error boundary object for a component.
	 * This provides `try` and `tryAsync` methods that wrap functions with error handling.
	 * @param {object} eventFlow - The EventFlowEngine instance.
	 * @param {string} [component="unknown"] - The name of the component to associate with errors.
	 * @returns {{try: function(function(): any): any, tryAsync: function(function(): Promise<any>): Promise<any>}} An error boundary object.
	 */
	createErrorBoundary(eventFlow, component = "unknown") {
		return {
			try: (fn) => this.captureSync(fn, eventFlow, { component }),
			tryAsync: (fn) => this.captureAsync(fn, eventFlow, { component }),
		};
	},

	/**
	 * Attaches global error listeners to `window` for uncaught exceptions and
	 * unhandled promise rejections, piping them through the standard error handling pipeline.
	 * @param {object} eventFlow - The EventFlowEngine instance to use for reporting.
	 */
	setupGlobalHandlers(eventFlow) {
		// Handle uncaught errors
		window.addEventListener("error", (event) => {
			this.handleError(event.error || event.message, eventFlow, {
				component: "global",
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			});
		});

		// Handle unhandled promise rejections
		window.addEventListener("unhandledrejection", (event) => {
			this.handleError(event.reason, eventFlow, {
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
	 * @returns {function(...any): Promise<any>} The wrapped, performance-aware function.
	 */
	withPerformanceTracking(fn, operation = "operation") {
		return async (...args) => {
			const startTime = performance.now();
			try {
				const result = await fn(...args);
				const duration = performance.now() - startTime;

				// Log slow operations
				if (duration > 100) {
					console.warn(
						`[ErrorHelpers] Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`
					);
				}

				return result;
			} catch (error) {
				const duration = performance.now() - startTime;
				throw this.formatError(error, {
					operation,
					duration: duration.toFixed(2),
					performance_issue: duration > 100,
				});
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
};

export default ErrorHelpers;
