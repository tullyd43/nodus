import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve paths relative to this file's location, not the current working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const allowlist = JSON.parse(
	fs.readFileSync(path.resolve(__dirname, ".eslint-allowlist.json"), "utf8")
).allowlist;

export default {
	name: "nodus/exception-overrides",
	rules: {
		"nodus/require-async-orchestration": [
			"error",
			{
				allowIn: allowlist.allowUnorchestratedAsync,
			},
		],
		"nodus/no-manual-platform-calls": [
			"error",
			{
				allowIn: allowlist.allowManualPlatformCalls,
			},
		],
	},
};
