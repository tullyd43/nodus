#!/usr/bin/env node
 
import { readdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function isJsFile(name) {
	return name.endsWith(".js");
}

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const ent of entries) {
		const p = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			if (
				ent.name === "node_modules" ||
				ent.name === "dist" ||
				ent.name === ".git"
			)
				continue;
			files.push(...(await walk(p)));
		} else if (ent.isFile() && isJsFile(ent.name)) {
			files.push(p);
		}
	}
	return files;
}

function methodLineMatch(line) {
	// class method (constructor allowed), async/static/get/set optional
	return (
		/^\s*(?:async\s+)?(?:static\s+)?(?:(?:get|set)\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.test(
			line
		) || /^\s*constructor\s*\([^)]*\)\s*\{/.test(line)
	);
}

function functionLineMatch(line) {
	return (
		/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(
			line
		) ||
		/^\s*(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*\([^)]*\)\s*=>\s*\{/.test(
			line
		)
	);
}

async function processFile(file) {
	const raw = await readFile(file, "utf8");
	const eol = raw.includes("\r\n") ? "\r\n" : "\n";
	const lines = raw.split(/\r?\n/);
	let changed = false;
	let insertions = 0;

	// We'll scan lines and insert stubs before detected method/function lines where no JSDoc exists.
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!methodLineMatch(line) && !functionLineMatch(line)) continue;

		// Look back up to 6 lines for an existing JSDoc '/**'
		let hasJSDoc = false;
		for (let j = Math.max(0, i - 6); j < i; j++) {
			if (lines[j].trim().startsWith("/**")) {
				hasJSDoc = true;
				break;
			}
		}
		if (hasJSDoc) continue;

		// Determine indent
		const indentMatch = line.match(/^\s*/);
		const indent = indentMatch ? indentMatch[0] : "";

		const stub = [
			`${indent}/**`,
			`${indent} * TODO: add JSDoc description`,
			`${indent} */`,
		];

		lines.splice(i, 0, ...stub);
		i += stub.length; // skip over inserted lines
		changed = true;
		insertions++;
	}

	if (changed) {
		// Backup original
		try {
			await copyFile(file, file + ".bak");
		} catch {
			// ignore backup errors
		}
		await writeFile(file, lines.join(eol), "utf8");
	}
	return insertions;
}

async function main() {
	try {
		const files = await walk(SRC);
		let total = 0;
		let touched = 0;
		for (const f of files) {
			const statInfo = await stat(f);
			if (statInfo.size === 0) continue;
			const count = await processFile(f);
			if (count > 0) {
				touched++;
				total += count;
				console.log(`patched ${f} (+${count})`);
			}
		}
		console.log(
			`\nCompleted JSDoc stub generation. Files modified: ${touched}, stubs added: ${total}`
		);
		if (total === 0)
			console.log(
				"No changes needed (all public methods already had JSDoc)."
			);
		process.exit(0);
	} catch (err) {
		console.error("Error generating JSDoc stubs:", err);
		process.exit(2);
	}
}

if (
	import.meta.url === `file://${process.argv[1]}` ||
	process.argv[1]?.endsWith("generate-jsdoc-stubs.js")
) {
	main();
}
