import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CDS } from "../../src/core/security/cds.js";

describe("CDS wrapper", () => {
	let originalTransport;

	beforeEach(() => {
		originalTransport = globalThis.__NODUS_CDS_TRANSPORT__;
	});

	afterEach(() => {
		globalThis.__NODUS_CDS_TRANSPORT__ = originalTransport;
		originalTransport = undefined;
	});

	it("forwards to transport and returns response from fetch", async () => {
		globalThis.__NODUS_CDS_TRANSPORT__ = async (url, init) => ({
			ok: true,
			status: 200,
			json: async () => ({ echoed: { url, method: init.method } }),
			text: async () =>
				JSON.stringify({ echoed: { url, method: init.method } }),
		});

		const res = await CDS.fetch("https://example.com/api", {
			method: "POST",
		});
		expect(res).toBeTruthy();
		const body = await res.json();
		expect(body.echoed.url).toBe("https://example.com/api");
		expect(body.echoed.method).toBe("POST");
	});

	it("fetchXHR returns status and responseText via transport", async () => {
		globalThis.__NODUS_CDS_TRANSPORT__ = async (url, init) => ({
			status: 201,
			ok: true,
			text: async () => "ok-response",
		});

		const resp = await CDS.fetchXHR("https://example.com/xhr");
		expect(resp.status).toBe(201);
		expect(resp.responseText).toBe("ok-response");
		expect(resp.ok).toBe(true);
	});

	it("throws on invalid URL", async () => {
		globalThis.__NODUS_CDS_TRANSPORT__ = async () => ({
			ok: true,
			status: 200,
			text: async () => "{}",
		});
		await expect(CDS.fetch("notaurl://nope")).rejects.toThrow();
	});
});
