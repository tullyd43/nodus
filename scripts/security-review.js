#!/usr/bin/env node
import fs from "fs";
const allowlist = JSON.parse(
	fs.readFileSync(".eslint-allowlist.json", "utf8")
).allowlist;
console.log("🔐 Approved allowlist entries:");
for (const [rule, paths] of Object.entries(allowlist)) {
	console.log(`\n  ${rule}:`);
	for (const p of paths) console.log(`    - ${p}`);
}
console.log("\n✅ Run `npx eslint .` to ensure compliance.\n");
