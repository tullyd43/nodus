/**
 * Wraps an asynchronous function to ensure it takes at least a minimum amount of time to execute.
 * This is a security utility used to mitigate timing side-channel attacks, where an attacker
 * could infer information based on the execution time of a sensitive operation (e.g., password or signature verification).
 * By padding the execution time to a constant minimum, it becomes more difficult to distinguish
 * between successful and failed operations based on how quickly they return.
 *
 * @async
 * @param {Function(): Promise<*>} fn - The asynchronous function to execute. It should return a promise.
 * @param {number} [minMs=100] - The minimum desired execution time in milliseconds. Defaults to 100ms.
 * @throws {Error} Re-throws any error that the wrapped function `fn` might throw after the minimum time has elapsed.
 * @returns {Promise<*>} A promise that resolves with the result of the wrapped function `fn`.
 */
export async function constantTimeCheck(fn, minMs = 100) {
	const start = performance.now();
	let result, err;
	try {
		result = await fn();
	} catch (e) {
		err = e;
	}
	const elapsed = performance.now() - start;
	const pad = Math.max(0, minMs - elapsed);
	await new Promise((r) => setTimeout(r, pad));
	if (err) throw err;
	return result;
}
