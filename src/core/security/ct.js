/**
 * @file ct.js
 * @description Provides constant-time operation wrappers to mitigate timing side-channel attacks.
 * These utilities are critical for security-sensitive operations like authentication and MAC checks.
 */

/**
 * Wraps an asynchronous function to ensure it takes at least a minimum amount of time to complete,
 * regardless of whether it succeeds or fails. This helps prevent timing attacks where an adversary
 * could infer information based on the response time of an operation.
 *
 * It also normalizes errors to prevent information leakage through error messages. Any failure
 * within the wrapped function will result in a generic error being thrown.
 *
 * @param {Function} fn - The asynchronous function to execute.
 * @param {object} [options={}] - Configuration options.
 * @param {number} [options.minDurationMs=100] - The minimum duration for the operation in milliseconds.
 * @param {import('../utils/ErrorHelpers.js').ErrorHelpers} [options.errorHelpers] - The error reporting service.
 * @param {import('../utils/MetricsRegistry.js').MetricsRegistry} [options.metrics] - The metrics reporting service.
 * @param {string} [options.operationName='unknown'] - A name for the operation for logging and metrics.
 * @returns {Promise<any>} A promise that resolves with the result of the function or rejects with a generic error.
 */
export async function constantTimeCheck(
	fn,
	{
		minDurationMs = 100,
		errorHelpers = null,
		metrics = null,
		operationName = "unknown",
	} = {}
) {
	const start = performance.now();
	let paddingMs = 0;

	try {
		// V8.0 Parity: Execute the function and return its result.
		return await fn();
	} catch (error) {
		// Mandate: Robustness. Do not leak information through specific error messages.
		// Report the original error internally for diagnostics.
		errorHelpers?.report(error, {
			component: "constantTimeCheck",
			operation: operationName,
			isSuppressed: true, // Indicate that we are handling and replacing this error.
		});

		// Throw a generic error to the caller.
		throw new Error(`Constant-time operation '${operationName}' failed.`);
	} finally {
		// V8.0 Parity: Use a `finally` block to ensure the timing check runs
		// regardless of whether the function succeeds or fails. This avoids code duplication.
		const elapsed = performance.now() - start;
		if (elapsed < minDurationMs) {
			paddingMs = minDurationMs - elapsed;
			await new Promise((resolve) => setTimeout(resolve, paddingMs));
		}

		// Mandate 4.3: Metrics are Not Optional. Report the amount of time added.
		metrics?.timer(`ct.padding.duration`, paddingMs, {
			operation: operationName,
		});
	}
}
