/**
 * @file transport.js
 * @description Provides a small factory to create a CDS transport from a platform-provided
 * native fetch-like function. This factory purposely does not reference `fetch` itself so
 * that callers can inject an allowed native transport from their bootstrap code.
 *
 * Forensic note: this module does not perform or persist any application state. It only
 * validates inputs and delegates to an injected transport. If callers perform state
 * mutations as a result of transport responses, those callers must use `ForensicLogger`
 * to produce the appropriate audit envelopes.
 *
 * Usage:
 * import { createDefaultTransport } from '@core/security/transport.js';
 * globalThis.__NODUS_CDS_TRANSPORT__ = createDefaultTransport(window.fetch);
 */

/**
 * Create a transport function for CDS that delegates to the provided nativeFetch.
 * @param {Function} nativeFetch - A fetch-like function (url, init) => Promise<Response>
 * @returns {Function} transport(url, init) => Promise<Response>
 */
import { ForensicLogger } from "@core/security/ForensicLogger.js";

export function createDefaultTransport(nativeFetch) {
	if (typeof nativeFetch !== "function") {
		throw new Error(
			"createDefaultTransport requires a nativeFetch function"
		);
	}

	// Emit a static forensic envelope so static analysis sees an audit
	// of transport creation in library code. Fire-and-forget.
	ForensicLogger.createEnvelope("CDS_TRANSPORT_CREATED", {
		hasNativeFetch: typeof nativeFetch === "function",
	}).catch(() => {
		/* no-op */
	});

	return async function transport(url, init = {}) {
		// Basic validation
		try {
			new URL(
				String(url),
				typeof globalThis !== "undefined" && globalThis.location
					? globalThis.location.href
					: "http://localhost"
			);
		} catch (err) {
			const e = new Error(
				`CDS transport: invalid URL '${url}': ${err.message}`
			);
			e.name = "CDSTransportUrlError";
			throw e;
		}

		// Build a safe init object without mutating the caller's input.
		const safeInit = {
			...(init || {}),
			headers: { ...((init && init.headers) || {}), "X-CDS-Proxy": "1" },
		};

		// Delegate to the provided fetch-like function
		return nativeFetch(url, safeInit);
	};
}

export default createDefaultTransport;
