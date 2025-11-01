#!/usr/bin/env node
/**
 * @file security-attest-auto-remediate.js
 * @description Automatically verifies the source code attestation manifest. If a hash
 * mismatch or signature failure is detected, it initiates a remediation workflow
 * that prompts for justification, regenerates the manifest, and logs a signed
 * forensic event for the action.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import readline from "node:readline";

import {
	appendSignedEnvelope,
	sha256Hex,
	gitInfo,
} from "./lib/security-envelope.js";

const log = (m) => console.log(`[auto-attest] ${m}`);

// 1. Run the verification script to check for mismatches.
let verifyOk = true;
try {
	execSync("node scripts/security-attest-verify.js", { stdio: "inherit" });
} catch {
	verifyOk = false;
}

if (verifyOk) {
	process.exit(0);
}

log(
	"❌ Detected hash mismatch or signature failure. Initiating auto-remediation..."
);

// 2. Prompt the developer for a justification.
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));
const justification = await ask(
	"\nEnter SECURITY justification (must begin with `SECURITY:`):\n> "
);
rl.close();

if (!/^SECURITY:/i.test(justification) || justification.length < 25) {
	console.error(
		"❌ Justification must begin with 'SECURITY:' and be at least 25 characters long. Aborting."
	);
	process.exit(1);
}

// 3. Regenerate manifest, sign it, and commit the changes.
try {
	execSync("node scripts/security-attest-gen.js", { stdio: "inherit" });
	execSync("git add .attest-manifest.json .attest-manifest.sig", {
		stdio: "inherit",
	});

	const prev = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
	const msg = `${justification}\n\n[auto-attest] Updated manifest due to verified change\nParent: ${prev}`;
	execSync(`git commit -m "${msg}"`, { stdio: "inherit" });
	log("✅ Manifest regenerated, signed, and committed.");

	// Re-verify to ensure the new state is valid before proceeding.
	execSync("node scripts/security-attest-verify.js", { stdio: "inherit" });
	log("✅ Verification passed after auto-remediation.");

	// 4. Create and log the signed forensic event for this remediation.
	const { commit, actor, repo } = gitInfo();
	const filesChanged = execSync(
		`git diff-tree --no-commit-id --name-only -r ${commit}`,
		{ encoding: "utf8" }
	)
		.split("\n")
		.filter(Boolean);

	appendSignedEnvelope({
		kind: "auto_attest_remediate",
		repo,
		actor,
		commit,
		parent: prev,
		justification,
		manifest_sha256: sha256Hex(
			readFileSync(".attest-manifest.json", "utf8")
		),
		files_changed: filesChanged,
	});

	// Add the updated forensic log to the same commit for atomicity.
	execSync("git add logs/security/attest_events.jsonl", { stdio: "inherit" });
	execSync("git commit --amend --no-edit", { stdio: "inherit" });
	log("✅ Forensic event for auto-remediation has been signed and logged.");
} catch (err) {
	console.error("❌ Auto-remediation failed:", err.message);
	process.exit(1);
}
