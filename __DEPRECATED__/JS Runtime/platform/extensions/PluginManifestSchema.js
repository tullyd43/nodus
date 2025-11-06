/**
 * @file PluginManifestSchema.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Canonical schema for plugin.json manifest files with comprehensive validation,
 * observability, and compliance features. This schema is a critical enforcement mechanism for
 * the V8 Parity Mandate, ensuring all plugins are declarative, secure, and composable.
 *
 * Security Classification: INTERNAL
 * License Tier: Core (schema validation is core functionality)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 *
 * @see {@link DEVELOPER_MANDATES.md} - Mandate 2.2: Logic MUST be Declarative and Schematized.
 */

import { DateCore } from "@shared/lib/DateUtils.js";

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
								"A unique identifier for the event flow within the plugin.",
						},
						name: {
							type: "string",
							required: true,
							description: "The display name of the event flow.",
						},
						description: {
							type: "string",
							description: "Event flow description",
						},
						trigger: {
							type: "object",
							required: true,
							properties: {
								events: {
									type: "array",
									items: { type: "string" },
									description:
										"Events that trigger this flow",
								},
								conditions: {
									type: "object",
									description:
										"Additional trigger conditions",
								},
							},
						},
						conditions: {
							type: "object",
							description:
								"Conditions that determine flow execution",
						},
						actions: {
							type: "object",
							required: true,
							description: "Actions to execute in the flow",
						},
						enabled: {
							type: "boolean",
							default: true,
							description: "Whether the flow is enabled",
						},
						priority: {
							type: "string",
							enum: ["low", "normal", "high"],
							default: "normal",
							description: "Flow execution priority",
						},
					},
				},
			},
		},
	},

	// Plugin dependencies
	dependencies: {
		type: "object",
		properties: {
			plugins: {
				type: "array",
				items: { type: "string" },
				description: "Required plugin dependencies",
			},
			frontend: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string", required: true },
						version: { type: "string" },
						cdnUrl: { type: "string", format: "url" },
					},
				},
				description: "Frontend library dependencies",
			},
			apiVersion: {
				type: "string",
				description: "Required API version",
			},
		},
	},

	// Plugin permissions
	permissions: {
		type: "array",
		items: { type: "string" },
		description: "Permissions required by the plugin",
	},

	// Plugin runtime configuration
	runtime: {
		type: "object",
		properties: {
			entrypoint: {
				type: "string",
				required: true,
				format: "url",
				description: "URL to the plugin's runtime JavaScript",
			},
			init: {
				type: "function",
				description: "Initialization function",
			},
			cleanup: {
				type: "function",
				description: "Cleanup function",
			},
		},
	},

	// Plugin configuration schema
	configSchema: {
		type: "object",
		description: "Schema for plugin configuration",
	},

	// Plugin marketplace metadata
	marketplace: {
		type: "object",
		properties: {
			category: {
				type: "string",
				enum: [
					"productivity",
					"analytics",
					"integration",
					"utility",
					"security",
					"development",
				],
				description: "Plugin category for marketplace",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Tags for plugin discovery",
			},
			pricing: {
				type: "object",
				properties: {
					model: {
						type: "string",
						enum: ["free", "paid", "freemium", "subscription"],
						description: "Pricing model",
					},
					price: {
						type: "number",
						description: "Price amount",
					},
				},
			},
			demoUrl: {
				type: "string",
				format: "url",
				description: "URL to plugin demo or documentation",
			},
		},
	},

	// Plugin signature for security validation
	signature: {
		type: "string",
		description: "Digital signature for plugin verification",
	},

	// Plugin code (if inline)
	code: {
		type: "string",
		description: "Plugin code for security scanning",
	},
};

/**
 * Example plugin manifests for different complexity levels.
 */
export const PluginManifestExamples = {
	// Simple widget plugin
	simpleWidget: {
		id: "simple-clock-widget",
		name: "Simple Clock Widget",
		version: "1.0.0",
		description: "A basic clock widget showing current time",
		author: { name: "Widget Team" },

		components: {
			widgets: [
				{
					id: "clock",
					name: "Digital Clock",
					category: "utility",
					supportedEntityTypes: ["*"],
					adaptations: {
						minimal: {
							trigger: { containerArea: { max: 10000 } },
							render: { format: "time-only", showSeconds: false },
						},
						standard: {
							trigger: {
								containerArea: { min: 10000, max: 50000 },
							},
							render: { format: "date-time", showSeconds: true },
						},
						detailed: {
							trigger: { containerArea: { min: 50000 } },
							render: {
								format: "full",
								showSeconds: true,
								showTimezone: true,
							},
						},
					},
				},
			],
		},

		runtime: {
			entrypoint:
				"https://cdn.example.com/plugins/clock/v1.0.0/runtime.js",
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
 * Validates a plugin manifest against a set of core rules with observability.
 * @param {object} manifest - The plugin manifest object to validate
 * @param {object} [context] - Optional context for validation (stateManager for observability)
 * @returns {{valid: boolean, errors: string[], warnings: string[]}} Validation result
 */
export function validateManifest(manifest, context = null) {
	const errors = [];
	const warnings = [];
	const validationStart = DateCore.timestamp();

	// Emit validation start event if context available
	if (context?.stateManager?.managers?.actionDispatcher) {
		try {
			context.stateManager.managers.actionDispatcher.dispatch(
				"plugin.manifest_validation_started",
				{
					manifestId: manifest?.id || "unknown",
					timestamp: validationStart,
					source: "PluginManifestSchema",
				}
			);
		} catch {
			// Best-effort observability
		}
	}

	try {
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
					if (!widget.name)
						errors.push(`Widget ${index}: missing name`);
				});
			}

			// Validate actions
			if (manifest.components.actions) {
				manifest.components.actions.forEach((action, index) => {
					if (!action.id) errors.push(`Action ${index}: missing id`);
					if (!action.name)
						errors.push(`Action ${index}: missing name`);
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

		// Validate permissions
		if (manifest.permissions && Array.isArray(manifest.permissions)) {
			manifest.permissions.forEach((permission, index) => {
				if (
					typeof permission !== "string" ||
					!permission.includes(".")
				) {
					warnings.push(
						`Permission ${index}: should follow 'domain.action' format`
					);
				}
			});
		}

		const validationEnd = DateCore.timestamp();
		const duration = validationEnd - validationStart;

		// Emit validation completed event if context available
		if (context?.stateManager?.managers?.actionDispatcher) {
			try {
				context.stateManager.managers.actionDispatcher.dispatch(
					"plugin.manifest_validation_completed",
					{
						manifestId: manifest?.id || "unknown",
						valid: errors.length === 0,
						errorCount: errors.length,
						warningCount: warnings.length,
						duration,
						timestamp: validationEnd,
						source: "PluginManifestSchema",
					}
				);
			} catch {
				// Best-effort observability
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	} catch (error) {
		// Emit validation error event if context available
		if (context?.stateManager?.managers?.actionDispatcher) {
			try {
				context.stateManager.managers.actionDispatcher.dispatch(
					"plugin.manifest_validation_error",
					{
						manifestId: manifest?.id || "unknown",
						error: error.message,
						timestamp: DateCore.timestamp(),
						source: "PluginManifestSchema",
					}
				);
			} catch {
				// Best-effort observability
			}
		}

		return {
			valid: false,
			errors: [`Validation failed: ${error.message}`],
			warnings: [],
		};
	}
}

/**
 * Creates a new plugin manifest object from a predefined template with observability.
 * @param {'simple'|'complex'} [type='simple'] - The type of template to use
 * @param {object} [context] - Optional context for observability (stateManager)
 * @returns {object} A new manifest object based on the selected template
 */
export function createManifestTemplate(type = "simple", context = null) {
	// Emit template creation event if context available
	if (context?.stateManager?.managers?.actionDispatcher) {
		try {
			context.stateManager.managers.actionDispatcher.dispatch(
				"plugin.manifest_template_created",
				{
					templateType: type,
					timestamp: DateCore.timestamp(),
					source: "PluginManifestSchema",
				}
			);
		} catch {
			// Best-effort observability
		}
	}

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

/**
 * Validates a specific component definition within a manifest.
 * @param {object} component - The component to validate
 * @param {string} componentType - The type of component ('widget', 'action', etc.)
 * @param {object} [context] - Optional context for observability
 * @returns {{valid: boolean, errors: string[], warnings: string[]}} Validation result
 */
export function validateComponent(component, componentType, context = null) {
	const errors = [];
	const warnings = [];

	// Emit component validation event if context available
	if (context?.stateManager?.managers?.actionDispatcher) {
		try {
			context.stateManager.managers.actionDispatcher.dispatch(
				"plugin.component_validation_started",
				{
					componentId: component?.id || "unknown",
					componentType,
					timestamp: DateCore.timestamp(),
					source: "PluginManifestSchema",
				}
			);
		} catch {
			// Best-effort observability
		}
	}

	// Basic component validation
	if (!component.id) errors.push("Component missing required field: id");
	if (!component.name) errors.push("Component missing required field: name");

	// Type-specific validation
	switch (componentType) {
		case "widget":
			if (
				component.supportedEntityTypes &&
				!Array.isArray(component.supportedEntityTypes)
			) {
				errors.push("Widget supportedEntityTypes must be an array");
			}
			break;
		case "action":
			if (
				component.category &&
				!["essential", "common", "advanced"].includes(
					component.category
				)
			) {
				warnings.push(`Invalid action category: ${component.category}`);
			}
			break;
		case "eventFlow":
			if (!component.trigger)
				errors.push("EventFlow missing required field: trigger");
			if (!component.actions)
				errors.push("EventFlow missing required field: actions");
			break;
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

export default PluginManifestSchema;
