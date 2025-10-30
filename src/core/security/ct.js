export async function constantTime(fn, floorMs = 12) {
	const t0 = performance.now();
	try {
		return await fn();
	} finally {
		const elapsed = performance.now() - t0;
		const pad = Math.max(0, floorMs - elapsed);
		const end = performance.now() + pad;
		while (performance.now() < end) {
			/* busy wait pad */
		}
	}
}
