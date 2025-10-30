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
