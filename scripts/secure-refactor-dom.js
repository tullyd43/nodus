#!/usr/bin/env node
/**
 * Nodus SafeDOM AutoRefactor
 * Replaces insecure DOM and network APIs with Nodus-safe equivalents.
 * Usage: node scripts/secure-refactor-dom.js
 */
import fs from "fs";
import path from "path";

const rootDir = path.resolve("./src");

const DOM_REPLACEMENTS = [
	{
		regex: /\.innerHTML\s*=\s*(.+?);/g,
		replace: (m, val) =>
			`.textContent = ${val}; // [auto: innerHTML → SafeDOM.setText()]`,
	},
	{
		regex: /\.outerHTML\s*=\s*(.+?);/g,
		replace: (m, val) =>
			`.textContent = ${val}; // [auto: outerHTML removed for safety]`,
	},
	{
		regex: /\.insertAdjacentHTML\s*\(([^,]+),\s*([^)]+)\)/g,
		replace: (m, pos, val) =>
			`.insertAdjacentText(${pos}, ${val}); // [auto: insertAdjacentHTML → SafeDOM.insert()]`,
	},
];

const NETWORK_REPLACEMENTS = [
	{ regex: /fetch\s*\(/g, replace: () => "CDS.fetch(" },
	{
		regex: /new\s+XMLHttpRequest\s*\(\)/g,
		replace: () => "CDS.fetchXHR(/* auto-migrated */)",
	},
];

function collectFiles(dir) {
	let files = [];
	for (const file of fs.readdirSync(dir)) {
		const full = path.join(dir, file);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) {
			if (!["node_modules", "dist", "test", "__tests__"].includes(file)) {
				files = files.concat(collectFiles(full));
			}
		} else if (file.endsWith(".js") || file.endsWith(".mjs")) {
			files.push(full);
		}
	}
	return files;
}

function hasImport(content, token) {
	return new RegExp(`from\\s+['\"]@core/.+/${token}\\.js['\"]`).test(content);
}

function ensureImports(content) {
	const lines = content.split("\n");
	const insertAt = lines.findIndex((l) => l.startsWith("import")) + 1 || 0;
	let updated = false;

	if (
		/innerHTML|outerHTML|insertAdjacentHTML/.test(content) &&
		!hasImport(content, "SafeDOM")
	) {
		lines.splice(
			insertAt,
			0,
			"import { SafeDOM } from '@core/ui/SafeDOM.js';"
		);
		updated = true;
	}

	if (/fetch|XMLHttpRequest/.test(content) && !hasImport(content, "CDS")) {
		lines.splice(
			insertAt,
			0,
			"import { CDS } from '@core/security/CDS.js';"
		);
		updated = true;
	}

	return updated ? lines.join("\n") : content;
}

function processFile(filePath) {
	let content = fs.readFileSync(filePath, "utf8");
	const original = content;

	for (const { regex, replace } of DOM_REPLACEMENTS)
		content = content.replace(regex, replace);
	for (const { regex, replace } of NETWORK_REPLACEMENTS)
		content = content.replace(regex, replace);

	content = ensureImports(content);

	if (content !== original) {
		fs.writeFileSync(filePath, content, "utf8");
		console.log(`🔧 Hardened: ${filePath}`);
	}
}

console.log("🚀 Running SafeDOM AutoRefactor...");
const files = collectFiles(rootDir);
files.forEach(processFile);
console.log(`✅ Completed. ${files.length} files scanned.`);
