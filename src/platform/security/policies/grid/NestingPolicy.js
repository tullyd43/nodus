/**
 * @file NestingPolicy.js
 * @description Canonical nested grid policy definitions and validators.
 */

export const NESTING_POLICY_DEFINITIONS = {
	"grid.nesting_enabled": {
		type: "boolean",
		default: false,
		domain: "grid",
		description: "Allow nested grids within grid blocks",
		category: "nesting",
	},
	"grid.nesting_max_depth": {
		type: "number",
		default: 2,
		domain: "grid",
		description: "Maximum levels of nested grids (root depth = 0)",
		category: "nesting",
	},
	"grid.nesting_max_blocks_per_grid": {
		type: "number",
		default: 24,
		domain: "grid",
		description: "Maximum number of blocks inside any single grid",
		category: "nesting",
	},
	"grid.nesting_max_total_blocks": {
		type: "number",
		default: 200,
		domain: "grid",
		description:
			"Hard cap on total blocks across a nested tree (advisory)",
		category: "nesting",
	},
};

export const NESTING_POLICY_VALIDATORS = {
	"grid.nesting_enabled": (value) => ({
		valid: typeof value === "boolean",
	}),
	"grid.nesting_max_depth": (value) => {
		const ok = Number.isInteger(value) && value >= 0 && value <= 8;
		return ok
			? { valid: true }
			: {
					valid: false,
					message: "nesting_max_depth must be 0..8",
			  };
	},
	"grid.nesting_max_blocks_per_grid": (value) => {
		const ok = Number.isInteger(value) && value >= 1 && value <= 500;
		return ok
			? { valid: true }
			: {
					valid: false,
					message:
						"nesting_max_blocks_per_grid must be 1..500",
			  };
	},
	"grid.nesting_max_total_blocks": (value) => {
		const ok = Number.isInteger(value) && value >= 1 && value <= 5000;
		return ok
			? { valid: true }
			: {
					valid: false,
					message:
						"nesting_max_total_blocks must be 1..5000",
			  };
	},
};

export default {
	NESTING_POLICY_DEFINITIONS,
	NESTING_POLICY_VALIDATORS,
};

