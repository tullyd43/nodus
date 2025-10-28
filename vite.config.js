import { defineConfig } from "vite";

export default defineConfig({
	server: { port: 5173 },
	build: {
		target: "esnext",
		outDir: "dist",
	},
	resolve: {
		alias: {
			"@core": "/src/core",
			"@state": "/src/state",
			"@grid": "/src/grid",
			"@ui": "/src/ui",
			"@utils": "/src/utils",
			"@managers": "/src/managers",
			"@database": "/src/database",
			"@docs": "/src/docs",
		},
	},
});
