/**
 * ErrorHelpers.js
 * Utility helpers for error normalization, reporting, and recovery in Nodus V7.1
 * Integrates with EventFlowEngine and provides comprehensive error handling
 */

export const ErrorHelpers = {
  /**
   * Format any error into a standardized structure
   * @param {Error|string|object} error - Error to format
   * @param {object} context - Additional context information
   * @returns {object} Formatted error object
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
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Categorize error based on type and message
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
   * Determine error severity based on type and context
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
   * Generate user-friendly error message
   */
  generateUserFriendlyMessage(error) {
    const category = error.category;
    const severity = error.severity;

    const messages = {
      ui_error: {
        high: "The interface encountered a serious problem. Please refresh the page.",
        medium:
          "There was an issue with the interface. Some features may not work properly.",
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
        medium:
          "An application error occurred. Some features may not work properly.",
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
   * Log error to console with formatted output
   */
  logToConsole(errorObj) {
    const { id, message, category, severity, stack, component } = errorObj;

    console.group(`❌ [${severity.toUpperCase()}] ${category} in ${component}`);
    console.error(`ID: ${id}`);
    console.error(`Message: ${message}`);
    console.error(`Stack trace:`);
    console.error(stack);
    console.groupEnd();
  },

  /**
   * Emit error to EventFlowEngine for processing
   */
  emitToFlow(eventFlow, error, context = {}) {
    if (!eventFlow || typeof eventFlow.emit !== "function") {
      console.warn("[ErrorHelpers] EventFlow not available, cannot emit error");
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
        emitError,
      );
      this.logToConsole(formattedError);
    }
  },

  /**
   * Capture and handle async function errors
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
   * Capture and handle sync function errors
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
   * Main error handling function
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
   * Attempt error recovery based on error type
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
          `[ErrorHelpers] No recovery strategy for ${error.category}`,
        );
    }
  },

  /**
   * Recovery strategies for different error types
   */
  recoverUIError(error, context) {
    // Try to refresh the affected component
    if (context.component && context.refreshComponent) {
      try {
        context.refreshComponent(context.component);
        console.log(
          `[ErrorHelpers] Attempted to refresh component: ${context.component}`,
        );
      } catch (recoveryError) {
        console.warn("[ErrorHelpers] Component refresh failed:", recoveryError);
      }
    }
  },

  recoverNetworkError(error, context) {
    // Enable offline mode or use cached data
    if (context.enableOfflineMode) {
      try {
        context.enableOfflineMode();
        console.log("[ErrorHelpers] Enabled offline mode due to network error");
      } catch (recoveryError) {
        console.warn(
          "[ErrorHelpers] Failed to enable offline mode:",
          recoveryError,
        );
      }
    }
  },

  recoverStorageError(error, context) {
    // Clear cache or use alternative storage
    if (context.clearCache) {
      try {
        context.clearCache();
        console.log("[ErrorHelpers] Cleared cache due to storage error");
      } catch (recoveryError) {
        console.warn("[ErrorHelpers] Failed to clear cache:", recoveryError);
      }
    }
  },

  recoverPolicyError(error, context) {
    // Show permission dialog or redirect to login
    console.log(
      "[ErrorHelpers] Policy error - user may need different permissions",
    );
    // Recovery would be handled by the UI layer
  },

  /**
   * Create error boundary wrapper for components
   */
  createErrorBoundary(eventFlow, component = "unknown") {
    return {
      try: (fn) => {
        return this.captureSync(fn, eventFlow, { component });
      },
      tryAsync: (fn) => {
        return this.captureAsync(fn, eventFlow, { component });
      },
    };
  },

  /**
   * Set up global error handlers
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
   * Create performance-aware error wrapper
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
            `[ErrorHelpers] Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`,
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
   * Validate and sanitize error data before processing
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
          "[EMAIL]",
        )
        .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD]")
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
    }

    // Limit stack trace length
    if (sanitized.stack && sanitized.stack.length > 2000) {
      sanitized.stack = sanitized.stack.substring(0, 2000) + "... [truncated]";
    }

    return sanitized;
  },
};

export default ErrorHelpers;
