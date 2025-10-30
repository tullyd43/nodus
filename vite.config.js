import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	server: {
		port: 3000,
		open: true,
		strictPort: true,
		watch: { usePolling: true },
	},
	build: {
		target: "es2022",
		cssCodeSplit: true,
		sourcemap: false,
		minify: "esbuild",
		assetsInlineLimit: 4096,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) return "vendor";
					if (id.includes("/core/")) return "core";
					if (id.includes("/grid/")) return "grid";
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
});
