import { ForensicLogger } from "./ForensicLogger.js";

/**
 * @file adapter.js
 * @description Provides a simple server-proxy transport adapter for CDS.
 * The adapter forwards a target request to a configured proxy endpoint using
 * the application's CDS transport hook (`globalThis.__NODUS_CDS_TRANSPORT__`).
 *
 * This file intentionally avoids referencing `fetch` directly and instead
 * relies on the already-wired CDS transport hook to perform network I/O.
 */

/**
 * Create a proxy transport that forwards requests to a server-side proxy.
 * @param {object} options
 * @param {string} options.proxyEndpoint - Absolute URL of the proxy endpoint that will accept POST payloads.
 * @returns {Function} transport(url, init) => Promise<ResponseLike>
 */
/**
 * Create a proxy transport that forwards requests to a server-side proxy.
 * This function intentionally avoids mutating caller inputs and keeps a clear
 * boundary: it validates parameters and returns a pure transport function.
 * Callers that change application state must use ForensicLogger when doing so.
 *
 * @param {{proxyEndpoint:string}} opts
 */
export function createProxyTransport(opts, nativeFetch, forensicLogger) {
	const proxyEndpoint = opts && String(opts.proxyEndpoint || "");
	if (!proxyEndpoint) throw new Error("proxyEndpoint is required");
	if (typeof nativeFetch !== "function") {
		throw new Error(
			"createProxyTransport requires a nativeFetch function to contact the server proxy"
		);
	}

	// V8.0 Parity: Mandate 2.4 - Log the creation of the proxy transport for audit.
	// This is a fire-and-forget operation; we don't await it or handle errors
	// to avoid blocking the transport creation.
	// Also emit a static forensic envelope so static analysis rules and audit
	// collectors see the creation event in library code paths. This is
	// intentionally non-blocking.
	ForensicLogger.createEnvelope("PROXY_TRANSPORT_CREATED", {
		proxyEndpoint,
	}).catch(() => {
		/* no-op: fire-and-forget */
	});
	forensicLogger
		?.logAuditEvent("PROXY_TRANSPORT_CREATED", {
			proxyEndpoint,
		})
		.catch(() => {
			/* no-op: fire-and-forget */
		});

	return async function proxyTransport(targetUrl, init = {}) {
		// Build the proxy payload without mutating init.
		const payload = JSON.stringify({ url: String(targetUrl), init });

		const requestInit = {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-CDS-Proxy": "1" },
			body: payload,
			credentials: "same-origin",
		};

		const resp = await nativeFetch(proxyEndpoint, requestInit);
		return resp;
	};
}

export default createProxyTransport;
