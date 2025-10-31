/**
 * @file PluginManifestSchema.js
 * @module PluginManifestSchema
 * @description Defines the canonical schema for `plugin.json` manifest files. This schema is a critical
 * enforcement mechanism for the V8 Parity Mandate, ensuring all plugins are declarative, secure, and
 * composable. It dictates the structure for metadata, component definitions, dependencies, and security policies.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - Mandate 2.2: Logic MUST be Declarative and Schematized.
 */

/**
 * The complete schema definition for a plugin manifest.
 * This object is used for validation and documentation of the plugin manifest structure.
 * @type {object}
 */
export const PluginManifestSchema = {
	// Core plugin metadata
	id: {
		type: "string",
		required: true,
		description:
			"A unique, machine-readable identifier for the plugin. Must be lowercase, and may contain hyphens or underscores.",
		pattern: "^[a-z0-9-_]+$",
		examples: ["fitness-tracker", "analytics-dashboard"],
	},

	name: {
		type: "string",
		required: true,
		description:
			"A human-readable name for the plugin, displayed in the UI.",
		maxLength: 100,
		examples: ["Fitness Tracker", "Analytics Dashboard"],
	},

	version: {
		type: "string",
		required: true,
		description:
			"The version of the plugin, following the Semantic Versioning (SemVer) specification.",
		pattern: "^\\d+\\.\\d+\\.\\d+(-[a-z0-9-]+)?$",
		examples: ["1.0.0", "2.1.3-beta"],
	},

	description: {
		type: "string", // V8.0 Parity: Keep descriptions concise.
		description: "Plugin description",
		maxLength: 500,
	},

	author: {
		type: "object",
		properties: {
			name: { type: "string", required: true },
			email: { type: "string", format: "email" },
			url: { type: "string", format: "url" },
		},
	},

	// Plugin configuration
	enabled: {
		type: "boolean",
		default: true,
		description: "If false, the plugin will not be loaded by the system.",
	},

	autoload: {
		type: "boolean",
		default: true,
		description:
			"If true, the plugin will be loaded automatically on application startup.",
	},

	priority: {
		type: "string",
		enum: ["low", "normal", "high"],
		default: "normal",
		description:
			"Determines the loading order of plugins. 'high' priority plugins are loaded first.",
	},

	// Plugin components
	components: {
		type: "object",
		properties: {
			widgets: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							type: "string",
							required: true, // V8.0 Parity: Consistent naming with ComponentDefinition
							description:
								"A unique identifier for the widget within the plugin.",
						},
						name: {
							type: "string",
							required: true,
							description: "The display name of the widget.",
						},
						category: {
							type: "string",
							description:
								"Category for UI grouping (e.g., 'dashboard', 'utility').",
						},
						description: {
							type: "string",
							description: "Widget description",
						},
						supportedEntityTypes: {
							// V8.0 Parity: Consistent naming with ComponentDefinition
							type: "array",
							items: { type: "string" }, // Renamed from supportedEntityTypes for consistency
							description: "Entity types this widget can display",
						},
						adaptations: {
							type: "object",
							description: "Adaptive rendering configurations",
							properties: {
								minimal: {
									type: "object",
									properties: {
										trigger: { type: "object" },
										render: { type: "object" },
									},
								},
								standard: {
									type: "object",
									properties: {
										trigger: { type: "object" },
										render: { type: "object" },
									},
								},
								detailed: {
									type: "object",
									properties: {
										trigger: { type: "object" },
										render: { type: "object" },
									},
								},
							},
						},
						configSchema: {
							// V8.0 Parity: Consistent naming with ComponentDefinition
							type: "object",
							description: "Configuration schema for widget",
						},
						defaultConfig: {
							// V8.0 Parity: Consistent naming with ComponentDefinition
							type: "object",
							description: "Default configuration values",
						},
					},
				},
			},

			actions: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							type: "string",
							required: true, // V8.0 Parity: Consistent naming with ComponentDefinition
							description:
								"A unique identifier for the action within the plugin.",
						},
						name: {
							type: "string",
							required: true,
							description: "The display name of the action.",
						},
						description: {
							type: "string",
							description: "Action description",
						},
						supportedEntityTypes: {
							// V8.0 Parity: Consistent naming with ComponentDefinition
							type: "array",
							items: { type: "string" }, // Renamed from supportedEntityTypes for consistency
							description: "Entity types this action applies to",
						},
						category: {
							type: "string",
							enum: ["essential", "common", "advanced"],
							default: "common",
							description:
								"Category for adaptive UI display (e.g., in menus).",
						},
						visibility: {
							type: "object",
							properties: {
								conditions: {
									type: "array",
									items: { type: "string" },
									description:
										"An array of declarative rule objects evaluated by the ConditionRegistry. All conditions must pass for the action to be visible.",
									examples: [
										[
											{
												type: "property_equals",
												property: "entity.status",
												value: "active",
											},
											{
												type: "user_has_permission",
												permissions: [
													"can_edit_entity",
												],
											},
										],
									],
								},
								permissions: {
									type: "array",
									items: { type: "string" },
									description:
										"DEPRECATED: Use a 'user_has_permission' condition instead for better composability.",
								},
							},
						},
						target: {
							type: "string",
							enum: [
								"self",
								"related",
								"selected",
								"new",
								"external",
							],
							default: "self",
							description:
								"The target entity or context for the action.",
						},
						confirmation: {
							type: "object",
							properties: {
								required: { type: "boolean", default: false },
								message: { type: "string" },
								level: {
									type: "string",
									enum: ["info", "warning", "danger"],
									default: "info",
								},
							},
						},
					},
				},
			},

			fieldRenderers: {
				// V8.0 Parity: camelCase
				type: "array",
				items: {
					type: "object",
					properties: {
						entityType: {
							// V8.0 Parity: camelCase
							type: "string",
							required: true,
							description: "Entity type (* for all types)",
						},
						field: {
							type: "string",
							required: true, // V8.0 Parity: camelCase
							description: "Field name or pattern",
						},
						fieldType: {
							// V8.0 Parity: camelCase
							type: "string",
							description: "Field data type",
						},
						adaptations: {
							type: "object",
							description: "Rendering adaptations by context",
							properties: {
								minimal: { type: "object" },
								standard: { type: "object" },
								detailed: { type: "object" },
							},
						},
						priority: {
							type: "number",
							default: 0,
							description:
								"Renderer priority (higher values are preferred).",
						},
					},
				},
			},

			commandHandlers: {
				// V8.0 Parity: camelCase
				type: "array",
				items: {
					type: "object",
					properties: {
						command: {
							type: "string",
							required: true,
							description:
								"The command type to handle (e.g., 'core:save').",
						},
						priority: {
							type: "number",
							default: 0,
							description:
								"Handler priority (higher values are preferred).",
						},
						async: {
							type: "boolean",
							default: false,
							description: "Whether handler is asynchronous",
						},
					},
				},
			},

			eventFlows: {
				// V8.0 Parity: camelCase
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							type: "string",
							required: true,
							description:
								"A unique identifier for the event flow.",
						},
						name: {
							type: "string",
							required: true,
							description: "A human-readable name for the flow.",
						},
						trigger: {
							type: "object",
							required: true,
							properties: {
								events: {
									type: "array", // V8.0 Parity: Consistent naming with EventFlowEngine
									items: { type: "string" },
									description:
										"An array of event names that trigger this flow.",
								},
							},
						},
						conditions: {
							type: "object",
							description: "Condition definitions",
						}, // V8.0 Parity: These are evaluated by the ConditionRegistry
						actions: {
							type: "object",
							description: "Actions to execute per condition",
						}, // V8.0 Parity: These are executed by the ActionHandlerRegistry
					},
				},
			},
		},
	},

	// Dependencies
	dependencies: {
		type: "object",
		properties: {
			plugins: {
				type: "array",
				items: { type: "string" },
				description:
					"An array of plugin IDs that this plugin depends on.",
			},
			frontend: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string", required: true },
						version: { type: "string" },
						cdnUrl: { type: "string", format: "url" }, // V8.0 Parity: camelCase
					},
				},
				description:
					"External frontend library dependencies (e.g., from a CDN).",
			},
			backend: {
				type: "array",
				items: { type: "string" },
				description:
					"Backend service dependencies (e.g., API endpoints).",
			},
			apiVersion: {
				// V8.0 Parity: camelCase
				type: "string",
				description: "Required platform API version",
			},
		},
	},

	// Runtime configuration
	runtime: {
		type: "object",
		properties: {
			entrypoint: {
				type: "string",
				format: "url",
				description:
					"The URL to the main JavaScript module for the plugin. This module must export an `initialize(context)` function.",
			},
			// V8.0 Parity: Mandate 2.1 - The 'inline' property is explicitly removed from the schema to forbid it.
		},
		description:
			"Defines the execution environment for the plugin. Only an external `entrypoint` is permitted for security.",
	},

	// Security configuration
	permissions: {
		type: "array",
		items: { type: "string" },
		description:
			"A list of permissions this plugin requires to function. These are checked during installation and runtime.",
		examples: [
			["storage.read", "storage.write", "ui.notifications.create"],
		],
	},

	sandbox: {
		type: "boolean",
		default: true,
		description: "Whether to run plugin in sandbox",
	},

	contentSecurityPolicy: {
		// V8.0 Parity: camelCase
		type: "object",
		properties: {
			scriptSrc: { type: "array", items: { type: "string" } }, // V8.0 Parity: camelCase
			styleSrc: { type: "array", items: { type: "string" } }, // V8.0 Parity: camelCase
			connectSrc: { type: "array", items: { type: "string" } }, // V8.0 Parity: camelCase
		},
	},

	// Configuration schema
	config: {
		type: "object",
		description:
			"Default configuration values for the plugin. These can be overridden by the user.",
	},

	configSchema: {
		// V8.0 Parity: camelCase
		type: "object",
		description:
			"A JSON Schema object that defines the structure and validation rules for the plugin's configuration.",
	},

	// Marketplace metadata
	marketplace: {
		type: "object",
		properties: {
			category: {
				type: "string",
				enum: [
					"productivity",
					"analytics",
					"communication",
					"integration",
					"visualization",
					"automation",
					"security",
					"development",
				],
				description:
					"The category under which the plugin is listed in the marketplace.",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Keywords that help users discover the plugin.",
			},
			screenshots: {
				type: "array",
				items: {
					type: "object",
					properties: {
						url: { type: "string", format: "url" },
						caption: { type: "string" },
					},
				},
			},
			demoUrl: {
				// V8.0 Parity: camelCase
				type: "string",
				format: "url",
				description: "A URL to a live demo or detailed documentation.",
			},
			pricing: {
				type: "object",
				properties: {
					model: {
						type: "string",
						enum: ["free", "freemium", "paid", "subscription"],
					},
					price: { type: "number" },
					currency: { type: "string" },
					billingPeriod: {
						// V8.0 Parity: camelCase
						type: "string",
						enum: ["one-time", "monthly", "yearly"],
					},
				},
			},
		},
	},

	// Lifecycle hooks
	lifecycle: {
		type: "object",
		properties: {
			install: {
				type: "object",
				properties: {
					scripts: { type: "array", items: { type: "string" } },
					migrations: { type: "array", items: { type: "object" } },
				},
			},
			update: {
				type: "object",
				properties: {
					scripts: { type: "array", items: { type: "string" } },
					migrations: { type: "array", items: { type: "object" } },
				},
			},
			uninstall: {
				type: "object",
				properties: {
					cleanupScripts: {
						// V8.0 Parity: camelCase
						type: "array",
						items: { type: "string" },
					},
				},
			},
		},
	},
};

/**
 * A collection of example plugin manifests for reference and testing.
 * @type {{simpleWidget: object, complexIntegration: object}}
 */
/**
 * Example plugin manifests for reference
 */
export const ExampleManifests = {
	// Simple widget plugin
	simpleWidget: {
		id: "simple-clock",
		name: "Simple Clock Widget",
		version: "1.0.0",
		description: "A simple clock widget for dashboards",
		author: { name: "Nodus Team" },

		components: {
			widgets: [
				{
					id: "clock_widget",
					name: "Clock",
					description: "Digital clock display",
					supportedEntityTypes: ["*"],
					adaptations: {
						minimal: {
							trigger: { containerWidth: { max: 200 } },
							render: { format: "HH:MM" },
						},
						standard: {
							trigger: { containerWidth: { min: 200, max: 400 } },
							render: { format: "HH:MM:SS", showDate: false },
						},
						detailed: {
							trigger: { containerWidth: { min: 400 } },
							render: {
								format: "full",
								showDate: true,
								showTimezone: true,
							},
						},
					},
				},
			],
		},

		// V8.0 Parity: The `inline` runtime is removed for security.
		// Plugins must provide an external entrypoint.
		runtime: {
			entrypoint:
				"https://cdn.example.com/plugins/simple-clock/v1.0.0/main.js",
			// The main.js file would contain:
			// export function initialize(context) {
			//   context.registerComponent('clock_widget', {
			//     render: (renderContext) => {
			//       const div = document.createElement('div');
			//       div.className = 'clock-widget';
			//       div.textContent = new Date().toLocaleTimeString();
			//       const intervalId = setInterval(() => {
			//         div.textContent = new Date().toLocaleTimeString();
			//       }, 1000);
			//       // It's crucial for components to handle their own cleanup.
			//       renderContext.hooks.onCleanup = () => clearInterval(intervalId);
			//       return div;
			//     },
			//   });
			// }
		},

		marketplace: {
			category: "productivity",
			tags: ["clock", "time", "widget", "dashboard"],
			pricing: { model: "free" },
		},
	},

	// Complex integration plugin
	complexIntegration: {
		id: "google-calendar-integration",
		name: "Google Calendar Integration",
		version: "2.1.0",
		description: "Integrate with Google Calendar for event management",
		author: { name: "Integration Team", email: "integrations@example.com" },

		dependencies: {
			plugins: ["authentication-manager"],
			frontend: [
				{
					name: "google-apis",
					version: "^1.0.0",
					cdnUrl: "https://apis.google.com/js/api.js",
				},
			],
			apiVersion: "6.0",
		},

		permissions: ["calendar.read", "calendar.write", "user.profile.read"],

		components: {
			widgets: [
				{
					id: "calendar_view",
					name: "Calendar View",
					supportedEntityTypes: ["event", "calendar"],
					adaptations: {
						minimal: {
							trigger: { containerArea: { max: 40000 } },
							render: { view: "agenda", events: 5 },
						},
						standard: {
							trigger: {
								containerArea: { min: 40000, max: 100000 },
							},
							render: { view: "week", toolbar: true },
						},
						detailed: {
							trigger: { containerArea: { min: 100000 } },
							render: {
								view: "month",
								toolbar: true,
								sidebar: true,
							},
						},
					},
				},
			],

			actions: [
				{
					id: "sync_google_calendar",
					name: "Sync with Google Calendar",
					supportedEntityTypes: ["calendar"],
					category: "common",
					target: "self",
					visibility: {
						conditions: [
							{
								type: "user_has_permission",
								permissions: ["calendar.write"],
							},
						],
					},
				},
			],

			eventFlows: [
				{
					id: "calendar_sync_flow",
					name: "Calendar Sync Flow",
					trigger: { events: ["calendar_updated", "event_created"] },
					conditions: {
						sync_enabled: {
							type: "property_equals",
							property: "entity.sync_enabled",
							value: true,
						},
					},
					actions: {
						sync_enabled: [
							{
								type: "sync_to_google",
								target: "google_calendar",
							},
							{
								type: "show_notification",
								message: "Calendar synced successfully",
							},
						],
					},
				},
			],
		},

		runtime: {
			entrypoint:
				"https://cdn.example.com/plugins/google-calendar/v2.1.0/runtime.js",
		},

		configSchema: {
			google_client_id: { type: "string", required: true },
			sync_interval: { type: "number", default: 300000 },
			default_calendar: { type: "string" },
		},

		marketplace: {
			category: "integration",
			tags: ["google", "calendar", "sync", "productivity"],
			pricing: { model: "freemium" },
			demoUrl: "https://docs.example.com/plugins/google-calendar",
		},
	},
};

/**
 * Validates a plugin manifest against a set of core rules.
 * @param {object} manifest - The plugin manifest object to validate.
 * @returns {{valid: boolean, errors: string[], warnings: string[]}} An object indicating if the manifest is valid, along with any errors or warnings.
 */
/**
 * Manifest validation function
 */
export function validateManifest(manifest) {
	const errors = [];
	const warnings = [];

	// Check required fields
	if (!manifest.id) errors.push("Missing required field: id");
	if (!manifest.name) errors.push("Missing required field: name");
	if (!manifest.version) errors.push("Missing required field: version");

	// Validate ID format
	if (manifest.id && !/^[a-z0-9-_]+$/.test(manifest.id)) {
		errors.push(
			"ID must contain only lowercase letters, numbers, hyphens, and underscores"
		);
	}

	// Validate version format
	if (
		manifest.version &&
		!/^\d+\.\d+\.\d+(-[a-z0-9-]+)?$/.test(manifest.version)
	) {
		errors.push(
			"Version must follow semantic versioning format (e.g., 1.0.0)"
		);
	}

	// Check components
	if (manifest.components) {
		// Validate widgets
		if (manifest.components.widgets) {
			manifest.components.widgets.forEach((widget, index) => {
				if (!widget.id) errors.push(`Widget ${index}: missing id`);
				if (!widget.name) errors.push(`Widget ${index}: missing name`);
			});
		}

		// Validate actions
		if (manifest.components.actions) {
			manifest.components.actions.forEach((action, index) => {
				if (!action.id) errors.push(`Action ${index}: missing id`);
				if (!action.name) errors.push(`Action ${index}: missing name`);
				if (
					action.category &&
					!["essential", "common", "advanced"].includes(
						action.category
					)
				) {
					warnings.push(
						`Action ${index}: invalid category '${action.category}'`
					);
				}
			});
		}
	}

	// Check runtime configuration
	if (!manifest.runtime) {
		errors.push("Missing required field: runtime");
	} else if (!manifest.runtime.entrypoint) {
		errors.push(
			"Missing required field: runtime.entrypoint. Inline runtimes are forbidden."
		);
	}

	// Check dependencies
	if (manifest.dependencies?.plugins) {
		manifest.dependencies.plugins.forEach((pluginId) => {
			if (!/^[a-z0-9-_]+$/.test(pluginId)) {
				warnings.push(`Invalid plugin dependency ID: ${pluginId}`);
			}
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Creates a new plugin manifest object from a predefined template.
 * @param {'simple'|'complex'} [type='simple'] - The type of template to use.
 * @returns {object} A new manifest object based on the selected template.
 */
/**
 * Create manifest from template
 */
export function createManifestTemplate(type = "simple") {
	const templates = {
		simple: {
			id: "",
			name: "",
			version: "1.0.0",
			description: "",
			author: { name: "" },
			components: {
				widgets: [],
			},
			runtime: {
				entrypoint: "",
			},
		},

		complex: {
			id: "",
			name: "",
			version: "1.0.0",
			description: "",
			author: { name: "", email: "" },
			dependencies: {
				plugins: [],
				frontend: [],
			},
			permissions: [],
			components: {
				widgets: [],
				actions: [],
				eventFlows: [],
			},
			runtime: {
				entrypoint: "",
			},
			configSchema: {},
			marketplace: {
				category: "productivity",
				tags: [],
			},
		},
	};

	return JSON.parse(JSON.stringify(templates[type] || templates.simple));
}

export default PluginManifestSchema;
