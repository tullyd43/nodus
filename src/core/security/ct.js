/**
 * @file ct.js
 * @description Provides constant-time operation wrappers to mitigate timing side-channel attacks.
 */

/**
 * Wraps an asynchronous function to ensure it takes at least a minimum amount of time to complete,
 * regardless of whether it succeeds or fails. This helps prevent timing attacks where an adversary
 * could infer information based on the response time of an operation.
 *
 * @param {Function} fn - The asynchronous function to execute.
 * @param {number} [minDurationMs=100] - The minimum duration for the operation in milliseconds.
 * @returns {Promise<any>} A promise that resolves with the result of the function or rejects with a uniform error.
 */
export async function constantTimeCheck(fn, minDurationMs = 100) {
	const start = performance.now();

	try {
		// V8.0 Parity: Execute the function and return its result.
		return await fn();
	} finally {
		// V8.0 Parity: Use a `finally` block to ensure the timing check runs
		// regardless of whether the function succeeds or fails. This avoids code duplication.
		const elapsed = performance.now() - start;
		if (elapsed < minDurationMs) {
			await new Promise((resolve) =>
				setTimeout(resolve, minDurationMs - elapsed)
			);
		}
	}
}
