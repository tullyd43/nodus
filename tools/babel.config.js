export default {
	presets: [
		[
			"@babel/preset-env",
			{
				targets: { node: "current" },
				modules: "commonjs", // Ensure ESM is transformed for Jest
			},
		],
	],
	plugins: [
		"@babel/plugin-proposal-private-methods",
		["@babel/plugin-proposal-private-property-in-object", { loose: true }],
	],
};
