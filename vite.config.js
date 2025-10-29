import { defineConfig } from "vite";

export default defineConfig({
	// Development
	server: {
		port: 3000,
		open: true,
	},

	// Build optimizations
	build: {
		target: "es2020",
		rollupOptions: {
			output: {
				manualChunks: {
					// Split vendor chunks
					vendor: ["date-fns", "dexie"],
					// Core modules
					core: [
						"./src/core/EventBus.js",
						"./src/core/StateManager.js",
					],
					// Grid system
					grid: [
						"./src/grid/GridSystem.js",
						"./src/grid/GridRenderer.js",
					],
				},
			},
		},
		// Keep bundle size reasonable
		chunkSizeWarningLimit: 600,
	},

	// Plugin configuration
	plugins: [],

	// Alias for cleaner imports
	resolve: {
		alias: {
			"@": "/src",
			"@core": "/src/core",
			"@grid": "/src/grid",
			"@utils": "/src/utils",
			"@components": "/src/components",
		},
	},

	// CSS configuration
	css: {
		devSourcemap: true,
	},
});
