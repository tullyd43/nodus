/**
 * @file ct.js
 * @description Provides constant-time operation wrappers to mitigate timing side-channel attacks. This module exports a higher-order function that wraps an async operation to ensure it executes in a minimum amount of time, which is then passed to an orchestrator.
 * These utilities are critical for security-sensitive operations like authentication and MAC checks.
 */

/**
 * Wraps an asynchronous function to ensure it takes at least a minimum amount of time to complete,
 * regardless of whether it succeeds or fails. This helps prevent timing attacks where an adversary
 * could infer information based on the response time of an operation.
 *
 * It also normalizes errors to prevent information leakage through error messages. Any failure
 * within the wrapped function will result in a generic error being thrown. This function returns a new function that should be passed to an orchestrator.
 *
 * @param {Function} fn - The asynchronous function to execute.
 * @param {object} [options={}] - Configuration options.
 * @param {number} [options.minDurationMs=100] - The minimum duration for the operation in milliseconds.
 * @param {import('../utils/ErrorHelpers.js').ErrorHelpers} [options.errorHelpers] - The error reporting service.
 * @param {import('../utils/MetricsRegistry.js').MetricsRegistry} [options.metrics] - The metrics reporting service.
 * @param {string} [options.operationName='unknown'] - A name for the operation for logging and metrics.
 * @returns {Function} A new synchronous function that returns a Promise, ready to be passed to an orchestrator.
 */
export function constantTimeCheck(
	fn,
	{ minDurationMs = 100, errorHelpers = null, operationName = "unknown" } = {}
) {
	// Return a new function that can be passed to an orchestrator's run() method.
	// This aligns with the Nodus pattern of not having standalone async functions.
	return () => {
		const start = performance.now();

		// The original async function is executed within a Promise chain.
		return Promise.resolve()
			.then(() => fn())
			.catch((error) => {
				// Mandate: Robustness. Do not leak information through specific error messages.
				// Report the original error internally for diagnostics.
				errorHelpers?.report(error, {
					component: "constantTimeCheck",
					operation: operationName,
					isSuppressed: true, // Indicate that we are handling and replacing this error.
				});

				// Throw a generic error to the caller.
				throw new Error(
					`Constant-time operation '${operationName}' failed.`
				);
			})
			.finally(() => {
				// V8.0 Parity: Use a `finally` block to ensure the timing check runs
				// regardless of whether the function succeeds or fails. This avoids code duplication.
				const elapsed = performance.now() - start;
				if (elapsed < minDurationMs) {
					const paddingMs = minDurationMs - elapsed;
					// The returned promise will be delayed by the padding amount.
					return new Promise((resolve) =>
						setTimeout(resolve, paddingMs)
					);
				}
			});
	};
}
