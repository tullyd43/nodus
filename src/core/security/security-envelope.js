/**
 * @file security-envelope.js
 * @description A helper library for creating and signing forensic event envelopes.
 * It handles key loading, content hashing, and appending signed events to a log file.
 */

import { Buffer } from "node:buffer";
import { execSync } from "node:child_process";
import { createHash, createPrivateKey, sign as nodeSign } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads the Ed25519 private key for signing.
 * @returns {import('crypto').KeyObject} The private key object.
 */
function loadEd25519Key() {
	const envKey = process.env.ATT_ED25519_SK_PEM;
	if (envKey && envKey.trim()) {
		return createPrivateKey(envKey);
	}
	// Fallback to a local key file if the environment variable is not set.
	// This path should be secured and not committed to the repository if it contains the actual private key.
	const keyPath = path.resolve("security/attest-trust/keys/ed25519_sk.pem");
	return createPrivateKey(readFileSync(keyPath, "utf8"));
}

/**
 * Calculates the SHA-256 hash of a buffer or string.
 * @param {Buffer|string} bufOrStr - The data to hash.
 * @returns {string} The hex-encoded hash.
 */
export function sha256Hex(bufOrStr) {
	const h = createHash("sha256");
	h.update(
		typeof bufOrStr === "string" ? Buffer.from(bufOrStr, "utf8") : bufOrStr
	);
	return h.digest("hex");
}

/**
 * Gathers information from the current Git state.
 * @returns {{commit: string, parent: string, actor: string, repo: string}} Git context information.
 */
export function gitInfo() {
	const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
	const parent = execSync("git rev-parse HEAD^", { encoding: "utf8" }).trim();
	const actor = (
		process.env.GIT_AUTHOR_NAME ||
		process.env.USER ||
		"unknown"
	).trim();
	const repo =
		execSync("git config --get remote.origin.url", {
			encoding: "utf8",
		}).trim() || "local";
	return { commit, parent, actor, repo };
}

/**
 * Creates and appends a signed forensic event to the attestation log.
 * @param {object} payload - The core event body to be signed.
 */
export function appendSignedEnvelope(payload) {
	const canonical = JSON.stringify(payload, Object.keys(payload).sort());
	const eventDigest = sha256Hex(canonical);
	const priv = loadEd25519Key();
	const signatureB64 = nodeSign(
		null,
		Buffer.from(canonical, "utf8"),
		priv
	).toString("base64");

	const envelope = {
		_type: "attest_event",
		alg: "ed25519",
		event_sha256: eventDigest,
		sig: signatureB64,
		ts: new Date().toISOString(),
		body: payload,
	};

	const dir = path.resolve("logs/security");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const out = path.join(dir, "attest_events.jsonl");
	appendFileSync(out, JSON.stringify(envelope) + "\n", "utf8");
}
