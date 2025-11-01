import fs from "fs";

const allowlist = JSON.parse(
	fs.readFileSync("./.eslint-allowlist.json", "utf8")
).allowlist;

export default {
	name: "copilotGuard/exception-overrides",
	rules: {
		"copilotGuard/no-insecure-api": [
			"error",
			{
				allowHTML: allowlist.safeHTML,
				allowFetch: allowlist.safeFetch,
			},
		],
		"copilotGuard/require-forensic-envelope": [
			"error",
			{ allowMutations: allowlist.unsafeMutations },
		],
	},
};
