#!/usr/bin/env node
import { execSync } from "child_process";
const env = { ...process.env, ESLINT_MODE: "tolerant" };
try {
	console.log(
		"Running secure lint (ESLINT_MODE=tolerant) and applying fixes..."
	);
	execSync("npx eslint . --ext .js,.mjs --fix", { stdio: "inherit", env });
	console.log("Secure lint finished.");
} catch (err) {
	// still surface non-zero exit code to caller
	console.error("Secure lint exited with an error.");
	process.exit(err.status || 1);
}
