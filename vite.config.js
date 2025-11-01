import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

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
					if (id.includes("/core/")) return "core";
					// Split grid policy modules into their own async chunks so they aren't pulled into initial grid bundle
					if (id.endsWith("/src/grid/policies/core.js")) return "grid-policies-core";
					if (id.endsWith("/src/grid/policies/nesting.js")) return "grid-policies-nesting";
					// Fallback: group other grid modules
					if (id.includes("/grid/") && !id.includes("/policies/")) return "grid";
				},
			},
		},
		chunkSizeWarningLimit: 800,
	},
	resolve: {
		alias: {
			"@": "/src",
			"@core": "/src/core",
			"@grid": "/src/grid",
			"@utils": "/src/utils",
			"@components": "/src/components",
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
