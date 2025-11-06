// Small centralized helper for observability toggles and conditional forensic wrapping
export function getObservabilityFlags(stateManager, overrides = {}) {
	const cfg = stateManager?.config?.syncLayerConfig?.observability ?? {};
	return {
		enableMetrics: cfg.enableMetrics ?? true,
		enableTimers: cfg.enableTimers ?? true,
		enableEvents: cfg.enableEvents ?? true,
		enableForensic: cfg.enableForensic ?? true,
		...overrides,
	};
}

export async function maybeWrap(
	forensicRegistry,
	flags,
	domain,
	operation,
	fn,
	meta
) {
	// If forensic wraps are disabled or wrapOperation is unavailable, execute directly
	if (!flags?.enableForensic || !forensicRegistry?.wrapOperation) {
		return fn();
	}

	// Delegate to forensic registry when available and enabled
	return forensicRegistry.wrapOperation(domain, operation, fn, meta);
}
