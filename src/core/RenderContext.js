/**
 * @file RenderContext.js
 * @description Provides a rich context object for rendering components, including environmental, user, and component-specific data.
 * It also includes a `ContextMatcher` utility for evaluating trigger conditions.
 */

/**
 * @class RenderContext
 * @classdesc Encapsulates all contextual information needed for a render operation.
 * This includes environmental data (viewport, theme), user data (ID, permissions),
 * and component-specific data (ID, configuration). It provides a consistent interface
 * for components and adaptation rules to access runtime metadata.
 */
export class RenderContext {
	/**
	 * Creates an instance of RenderContext.
	 * @param {object} [options={}] - An object containing initial context properties.
	 */
	constructor(options = {}) {
		this.uiContext = options.uiContext || {};

		// Environment context
		this.viewport = options.viewport || this.getViewportInfo();
		this.theme = options.theme || "dark";
		this.locale = options.locale || "en";
		this.inputMethod = options.inputMethod || this.detectInputMethod();

		// Runtime dependencies
		this.stateManager = options.stateManager || null;
		this.eventFlow = options.eventFlow || null;
		this.policies = options.policies || {};

		// User context
		this.userId = options.userId || null;
		this.userRole = options.userRole || "guest";
		this.userPermissions = options.userPermissions || [];

		// Device capabilities
		this.device = this.getDeviceCapabilities();
		this.networkLatency = options.networkLatency || null;

		// Component context (for current render)
		this.componentId = options.componentId || null;
		this.data = options.data || {};
		this.config = options.config || {};

		// Container context
		this.containerWidth = options.containerWidth || window.innerWidth;
		this.containerHeight = options.containerHeight || window.innerHeight;
		this.containerArea = this.containerWidth * this.containerHeight;

		// Adaptive context
		this.intent = options.intent || null;
		this.purpose = options.purpose || null;
		this.entityType = options.entityType || null;
		this.entityId = options.entityId || null;
		this.entity = options.entity || null;

		// Render metadata
		this.adaptationName = options.adaptationName || null;
		this.timestamp = Date.now();
		this.priority = options.priority || 0;
	}

	/**
	 * Retrieves an entity from the state manager's client state or the local UI context.
	 * @param {string} entityId - The ID of the entity to retrieve.
	 * @returns {object|null} The entity object, or null if not found.
	 */
	getEntity(entityId) {
		return (
			this.stateManager.clientState.entities.get(entityId) ||
			this.uiContext.entities?.find?.((e) => e.id === entityId) ||
			null
		);
	}

	/**
	 * Saves an entity through the state manager's storage instance after validation.
	 * @param {object} entity - The entity object to save.
	 * @returns {Promise<void>}
	 */
	async saveEntity(entity) {
		await this.stateManager.managers.validation?.validate?.(entity);
		await this.stateManager.storage.instance.put("objects", entity);
		this.stateManager.emit?.("entitySaved", {
			store: "objects",
			item: entity,
		});
	}

	/**
	 * Creates a new `RenderContext` instance that inherits from the current context,
	 * with additional properties merged in. This is useful for passing context to child components.
	 * @param {object} [additionalContext={}] - An object with properties to add or override in the new context.
	 * @returns {RenderContext} A new, extended RenderContext instance.
	 */
	extend(additionalContext = {}) {
		return new RenderContext({
			...this.toObject(),
			...additionalContext,
		});
	}

	/**
	 * Converts the context instance into a plain JavaScript object, suitable for serialization or caching.
	 * @returns {object} A plain object representation of the context.
	 */
	toObject() {
		return {
			viewport: this.viewport,
			theme: this.theme,
			locale: this.locale,
			inputMethod: this.inputMethod,
			stateManager: this.stateManager,
			eventFlow: this.eventFlow,
			policies: this.policies,
			userId: this.userId,
			userRole: this.userRole,
			userPermissions: this.userPermissions,
			device: this.device,
			networkLatency: this.networkLatency,
			componentId: this.componentId,
			data: this.data,
			config: this.config,
			containerWidth: this.containerWidth,
			containerHeight: this.containerHeight,
			containerArea: this.containerArea,
			intent: this.intent,
			purpose: this.purpose,
			entityType: this.entityType,
			entityId: this.entityId,
			entity: this.entity,
			adaptationName: this.adaptationName,
			timestamp: this.timestamp,
			priority: this.priority,
		};
	}

	/**
	 * Gathers and returns information about the current browser viewport.
	 * @private
	 * @returns {{width: number, height: number, pixelRatio: number, orientation: string}} An object with viewport details.
	 */
	getViewportInfo() {
		return {
			width: window.innerWidth,
			height: window.innerHeight,
			pixelRatio: window.devicePixelRatio || 1,
			orientation: window.screen?.orientation?.type || "unknown",
		};
	}

	/**
	 * Detects the primary input method of the device (e.g., 'touch' or 'mouse').
	 * @private
	 * @returns {'touch'|'mouse'} The detected input method.
	 */
	detectInputMethod() {
		// Simple detection - can be enhanced
		if ("ontouchstart" in window) return "touch";
		if (navigator.maxTouchPoints > 0) return "touch";
		return "mouse";
	}

	/**
	 * Gathers and returns information about the capabilities of the current device and browser.
	 * @private
	 * @returns {object} An object detailing device capabilities.
	 */
	getDeviceCapabilities() {
		return {
			hasTouch: "ontouchstart" in window,
			hasHover: window.matchMedia("(hover: hover)").matches,
			reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches,
			highContrast: window.matchMedia("(prefers-contrast: high)").matches,
			darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches,
			connectionType: navigator.connection?.effectiveType || "unknown",
			memoryLimit: navigator.deviceMemory || null,
			concurrency: navigator.hardwareConcurrency || 1,
		};
	}

	/**
	 * Validates that the context contains a set of required properties.
	 * @param {string[]} [requiredProperties=[]] - An array of property names that must exist in the context.
	 * @returns {{valid: boolean, missing: string[]}} An object indicating if the validation passed and a list of any missing properties.
	 */
	validate(requiredProperties = []) {
		const missing = [];

		for (const prop of requiredProperties) {
			if (this[prop] === undefined || this[prop] === null) {
				missing.push(prop);
			}
		}

		return {
			valid: missing.length === 0,
			missing,
		};
	}

	/**
	 * Checks if the current user has a specific permission.
	 * @param {string} permission - The permission string to check for.
	 * @returns {boolean} `true` if the user has the permission, `false` otherwise.
	 */
	hasPermission(permission) {
		return (
			this.userPermissions.includes(permission) ||
			this.userRole === "super_admin"
		);
	}

	/**
	 * Checks if the current user's role grants access to a specific application domain.
	 * @param {string} domain - The domain to check access for (e.g., 'system', 'ui').
	 * @returns {boolean} `true` if the user can access the domain, `false` otherwise.
	 */
	canAccessDomain(domain) {
		// This will integrate with OptimizationAccessControl
		if (this.userRole === "super_admin") return true;

		const rolePermissions = {
			db_admin: ["system", "ui", "events"],
			developer: ["ui", "events"],
			analyst: ["user", "meta"],
			monitor: ["meta"],
		};

		return rolePermissions[this.userRole]?.includes(domain) || false;
	}

	/**
	 * Retrieves a map of CSS variables for the current theme.
	 * @returns {object} An object where keys are CSS variable names and values are their corresponding colors.
	 */
	getThemeVariables() {
		const themes = {
			dark: {
				"--surface": "#1e1e1e",
				"--surface-elevated": "#2d2d2d",
				"--text": "#f5f5f5",
				"--text-muted": "#b0b0b0",
				"--primary": "#007acc",
				"--secondary": "#6c757d",
				"--success": "#28a745",
				"--warning": "#ffc107",
				"--error": "#dc3545",
				"--border": "#404040",
			},
			light: {
				"--surface": "#ffffff",
				"--surface-elevated": "#f8f9fa",
				"--text": "#212529",
				"--text-muted": "#6c757d",
				"--primary": "#007acc",
				"--secondary": "#6c757d",
				"--success": "#28a745",
				"--warning": "#ffc107",
				"--error": "#dc3545",
				"--border": "#dee2e6",
			},
		};

		return themes[this.theme] || themes.dark;
	}

	/**
	 * Applies the current theme's CSS variables to the document's root element.
	 * @returns {void}
	 */
	applyTheme() {
		const variables = this.getThemeVariables();
		const root = document.documentElement;

		Object.entries(variables).forEach(([property, value]) => {
			root.style.setProperty(property, value);
		});
	}

	/**
	 * Gets the standard set of responsive breakpoints.
	 * @returns {{xs: number, sm: number, md: number, lg: number, xl: number, xxl: number}} An object mapping breakpoint names to their minimum width.
	 */
	getBreakpoints() {
		return {
			xs: 0,
			sm: 576,
			md: 768,
			lg: 992,
			xl: 1200,
			xxl: 1400,
		};
	}

	/**
	 * Determines the current responsive breakpoint based on the container's width.
	 * @returns {string} The name of the current breakpoint (e.g., 'xs', 'sm', 'md').
	 */
	getCurrentBreakpoint() {
		const breakpoints = this.getBreakpoints();
		const width = this.containerWidth;

		if (width >= breakpoints.xxl) return "xxl";
		if (width >= breakpoints.xl) return "xl";
		if (width >= breakpoints.lg) return "lg";
		if (width >= breakpoints.md) return "md";
		if (width >= breakpoints.sm) return "sm";
		return "xs";
	}

	/**
	 * Checks if the current context matches a given set of trigger conditions.
	 * @param {object} trigger - The trigger object to evaluate against the context.
	 * @returns {boolean} `true` if the context matches the trigger, `false` otherwise.
	 */
	matches(trigger) {
		return ContextMatcher.matches(trigger, this);
	}
}

/**
 * @class ContextMatcher
 * @classdesc A utility class with static methods for evaluating trigger conditions against a `RenderContext`.
 * It provides a declarative way to define rules for adaptive rendering.
 */
export class ContextMatcher {
	/**
	 * Checks if a `RenderContext` instance matches a given trigger object.
	 * @static
	 * @param {object} trigger - The trigger object containing conditions to check.
	 * @param {RenderContext|object} context - The context to evaluate.
	 * @returns {boolean} `true` if all conditions in the trigger are met by the context, `false` otherwise.
	 */
	static matches(trigger, context) {
		if (!trigger) return true;

		// Ensure context is a RenderContext instance
		const ctx =
			context instanceof RenderContext
				? context
				: new RenderContext(context);

		// Container size matching
		if (trigger.containerWidth) {
			if (
				trigger.containerWidth.min &&
				ctx.containerWidth < trigger.containerWidth.min
			)
				return false;
			if (
				trigger.containerWidth.max &&
				ctx.containerWidth > trigger.containerWidth.max
			)
				return false;
		}

		if (trigger.containerHeight) {
			if (
				trigger.containerHeight.min &&
				ctx.containerHeight < trigger.containerHeight.min
			)
				return false;
			if (
				trigger.containerHeight.max &&
				ctx.containerHeight > trigger.containerHeight.max
			)
				return false;
		}

		// Container area matching
		if (trigger.containerArea) {
			if (
				trigger.containerArea.min &&
				ctx.containerArea < trigger.containerArea.min
			)
				return false;
			if (
				trigger.containerArea.max &&
				ctx.containerArea > trigger.containerArea.max
			)
				return false;
		}

		// Purpose/intent matching
		if (trigger.purpose && ctx.purpose !== trigger.purpose) return false;
		if (trigger.intent && ctx.intent !== trigger.intent) return false;

		// Device capability matching
		if (
			trigger.hasTouch !== undefined &&
			ctx.device.hasTouch !== trigger.hasTouch
		)
			return false;
		if (
			trigger.hasHover !== undefined &&
			ctx.device.hasHover !== trigger.hasHover
		)
			return false;

		// Theme matching
		if (trigger.theme && ctx.theme !== trigger.theme) return false;

		// User role matching
		if (trigger.userRole && ctx.userRole !== trigger.userRole) return false;

		// Permission matching
		if (trigger.permission && !ctx.hasPermission(trigger.permission))
			return false;

		// Breakpoint matching
		if (trigger.breakpoint) {
			const currentBreakpoint = ctx.getCurrentBreakpoint();
			if (Array.isArray(trigger.breakpoint)) {
				if (!trigger.breakpoint.includes(currentBreakpoint))
					return false;
			} else if (currentBreakpoint !== trigger.breakpoint) {
				return false;
			}
		}

		// Entity type matching
		if (trigger.entityType && ctx.entityType !== trigger.entityType)
			return false;

		// Custom predicate matching
		if (trigger.predicate && typeof trigger.predicate === "function") {
			if (!trigger.predicate(ctx)) return false;
		}

		return true;
	}

	/**
	 * Finds the best-matching adaptation from a set of adaptations based on the current context.
	 * @static
	 * @param {object} adaptations - An object where keys are adaptation names and values are adaptation definitions (including triggers).
	 * @param {RenderContext} context - The current rendering context.
	 * @returns {object|null} The best-matching adaptation object, or null if no match is found.
	 */
	static findBestMatch(adaptations, context) {
		if (!adaptations || typeof adaptations !== "object") return null;

		let bestMatch = null;
		let bestScore = -1;

		for (const [name, adaptation] of Object.entries(adaptations)) {
			if (this.matches(adaptation.trigger, context)) {
				const score = this.calculateMatchScore(
					adaptation.trigger,
					context
				);
				if (score > bestScore) {
					bestScore = score;
					bestMatch = { name, ...adaptation };
				}
			}
		}

		return bestMatch;
	}

	/**
	 * Calculates a specificity score for a trigger match. More specific triggers receive a higher score,
	 * allowing for more precise adaptation selection.
	 * @static
	 * @param {object} trigger - The trigger object that was matched.
	 * @param {RenderContext} context - The context it was matched against.
	 * @returns {number} The calculated specificity score.
	 */
	static calculateMatchScore(trigger, context) {
		if (!trigger) return 1; // Default match

		let score = 0;

		// More specific matches get higher scores
		if (trigger.containerWidth) score += 10;
		if (trigger.containerHeight) score += 10;
		if (trigger.containerArea) score += 15;
		if (trigger.purpose) score += 20;
		if (trigger.intent) score += 20;
		if (trigger.entityType) score += 25;
		if (trigger.userRole) score += 15;
		if (trigger.permission) score += 30;
		if (trigger.breakpoint) score += 10;
		if (trigger.theme) score += 5;
		if (trigger.predicate) score += 50; // Custom predicates are highly specific

		return score;
	}
}

export default RenderContext;
