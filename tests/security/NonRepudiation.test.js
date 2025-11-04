// tests/unit/security/NonRepudiation.test.js

import { NonRepudiation } from "@core/security/NonRepudiation.js";
/* global describe,test,beforeEach,expect,vi */
/* eslint-disable nodus/require-async-orchestration */

describe("NonRepudiation", () => {
	let signer;

	beforeEach(() => {
		signer = new NonRepudiation();
	});

	test("should initialize without errors", () => {
		expect(signer).toBeInstanceOf(NonRepudiation);
	});

	test("should sign an action and return a valid signature object", async () => {
		const actionPayload = {
			userId: "user-123",
			action: { type: "create", entity: "document" },
			label: { classification: "confidential" },
		};

		const signedResult = await signer.signAction(actionPayload);

		expect(signedResult).toHaveProperty("signature");
		expect(typeof signedResult.signature).toBe("string");
		expect(signedResult.signature.length).toBeGreaterThan(0);

		expect(signedResult).toHaveProperty("algorithm", "ECDSA-P256-SHA256");
		expect(signedResult).toHaveProperty("timestamp");
		expect(new Date(signedResult.timestamp)).toBeInstanceOf(Date);
	});

	test("should successfully verify a valid signature", async () => {
		// This test is tricky because the timestamp is generated inside `signAction`.
		// We can't easily reconstruct the exact payload for verification.
		// For now, we'll mock `Date.now()` to create a deterministic payload.

		const fixedTimestamp = 1672531200000; // Jan 1, 2023
		const spy = vi
			.spyOn(Date, "now")
			.mockImplementation(() => fixedTimestamp);

		const actionPayload = {
			userId: "user-456",
			action: { type: "delete", entity: "note" },
			label: { classification: "secret" },
		};

		const signedResult = await signer.signAction(actionPayload);

		// Reconstruct the exact payload that was signed
		const verificationPayload = {
			...actionPayload,
			ts: fixedTimestamp,
		};

		const isValid = await signer.verifySignature(
			signedResult.signature,
			verificationPayload
		);

		expect(isValid).toBe(true);

		spy.mockRestore(); // Clean up the mock
	});

	test("should fail to verify a tampered payload", async () => {
		const fixedTimestamp = 1672531200000;
		const spy = vi
			.spyOn(Date, "now")
			.mockImplementation(() => fixedTimestamp);

		const actionPayload = {
			userId: "user-789",
			action: { type: "read" },
			label: { classification: "public" },
		};

		const signedResult = await signer.signAction(actionPayload);

		// Tamper with the payload for verification
		const tamperedPayload = {
			...actionPayload,
			ts: fixedTimestamp,
			userId: "attacker-001",
		};

		const isValid = await signer.verifySignature(
			signedResult.signature,
			tamperedPayload
		);
		expect(isValid).toBe(false);

		spy.mockRestore();
	});
});
