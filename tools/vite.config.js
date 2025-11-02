/*
 ESLint: This file is a build-time configuration for Vite/Rollup. It must import
 Node/Vite/rollup plugins which are build-time dependencies. The repository's
 `copilotGuard/no-runtime-dependencies` rule flags these imports elsewhere in
 application code, but they are acceptable here. Disable that rule for this file.
*/
/* eslint-disable copilotGuard/no-runtime-dependencies */

import path from "path";
import { fileURLToPath } from "url";

import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

// Create __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vitest config is integrated here
export default defineConfig({
	publicDir: "public",
	base: "./",
	server: {
		port: 3000,
		open: true,
		strictPort: false, // Allow Vite to find the next available port if 3000 is busy
		watch: { usePolling: true },
	},
	build: {
		target: "es2022",
		cssCodeSplit: true,
		sourcemap: false,
		minify: "esbuild",
		assetsInlineLimit: 4096,
		rollupOptions: {
			plugins: [
				visualizer({
					filename: "dist/stats.html", // Output file for the visualization
					open: true, // Automatically open in browser after build
					gzipSize: true, // Show gzipped sizes
				}),
			],
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) return "vendor";
					if (id.includes("/platform/")) return "platform";
					// Split grid policy modules into their own async chunks so they aren't pulled into initial grid bundle
					if (
						id.endsWith(
							"/src/features/grid/policies/CoreGridPolicy.js"
						)
					)
						return "grid-policies-core";
					if (
						id.endsWith(
							"/src/features/grid/policies/NestingPolicy.js"
						)
					)
						return "grid-policies-nesting";
					// Fallback: group other grid modules
					if (
						id.includes("/features/grid/") &&
						!id.includes("/policies/")
					)
						return "grid";
				},
			},
		},
		chunkSizeWarningLimit: 800,
	},
	resolve: {
		// Use explicit path.resolve so aliases work correctly on Windows and CI
		alias: {
			"@": path.resolve(__dirname, "..", "src"),
			"@app": path.resolve(__dirname, "..", "src/app"),
			"@platform": path.resolve(__dirname, "..", "src/platform"),
			"@features": path.resolve(__dirname, "..", "src/features"),
			"@shared": path.resolve(__dirname, "..", "src/shared"),
			// Compatibility aliases for legacy imports
			// File-level compatibility for some legacy tests/imports
			// Support absolute-style imports used in some tests (e.g. "/src/grid/...")
			"@core": path.resolve(__dirname, "..", "src/platform"),
			"@core/state": path.resolve(__dirname, "..", "src/platform/state"),
			// Standard project aliases (namespaced and directory-oriented)
			"@grid": path.resolve(__dirname, "..", "src/features/grid"),
			"@utils": path.resolve(__dirname, "..", "src/shared/lib"),
			"@components": path.resolve(
				__dirname,
				"..",
				"src/shared/components"
			),
			// note: legacy absolute '/src/...' mappings intentionally removed —
			// prefer fixing source imports to use the canonical @utils alias.
			// ensure each alias is defined only once
		},
	},
	css: { devSourcemap: true },
	// --- Vitest Configuration ---
	test: {
		globals: true, // Use Vitest's globals (describe, test, expect)
		environment: "jsdom", // Simulate a browser environment for tests
		include: ["tests/**/*.test.js"], // Specify where to find unit tests
		setupFiles: [], // Optional: for global test setup
	},
});
