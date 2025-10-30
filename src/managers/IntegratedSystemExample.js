/**
 * @file IntegratedSystemExample.js
 * @description A complete example demonstrating how to initialize and integrate all core Nodus systems,
 * including access control, policies, error handling, and the `BuildingBlockRenderer`.
 */

import { BuildingBlockRenderer } from "../core/BuildingBlockRenderer.js";
import { OptimizationAccessControl } from "../core/OptimizationAccessControl_Enhanced.js";
import { RenderContext } from "../core/RenderContext_Updated.js";
import { SystemPolicies } from "../core/SystemPolicies.js";

// Import building blocks
import { registerPerformanceOverlayBlock } from "../ui/blocks/PerformanceOverlayBlock.js";
import { registerPolicyControlBlock } from "../ui/blocks/PolicyControlBlock.js";
import { ErrorHelpers, ERROR_FLOW_DEFINITIONS } from "../utils/ErrorHelpers.js";

/**
 * @class IntegratedSystemExample
 * @classdesc An example class that orchestrates the initialization and demonstration of the complete Nodus system,
 * showcasing the "Building Block" paradigm in action.
 */
export class IntegratedSystemExample {
	/**
	 * Creates an instance of IntegratedSystemExample.
	 * @param {object} [config={}] - Configuration options for the integrated system.
	 * @param {string} [config.environment='development'] - The application environment.
	 * @param {boolean} [config.enableSecurity=true] - Whether to enable the access control system.
	 * @param {boolean} [config.enablePolicies=true] - Whether to enable the policy management system.
	 * @param {boolean} [config.enableErrorHandling=true] - Whether to enable centralized error handling.
	 */
	constructor(config = {}) {
		this.config = {
			environment: "development",
			enableSecurity: true,
			enablePolicies: true,
			enableErrorHandling: true,
			...config,
		};

		/** @type {RenderContext|null} */
		this.context = null;
		/** @type {BuildingBlockRenderer|null} */
		this.renderer = null;
		/** @type {import('../core/OptimizationWebSocketServer.js').OptimizationWebSocketServer|null} */
		this.wsServer = null;
		/** @type {boolean} */
		this.initialized = false;
	}

	/**
	 * Initializes all core systems in a specific order: Access Control, Policies, Error Handling,
	 * Render Context, and the Building Block Renderer. It then registers components and runs a demo.
	 * @public
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
			console.log("🚀 Initializing Integrated Nodus System...");

			// 1. Initialize access control
			if (this.config.enableSecurity) {
				await this.initializeAccessControl();
			}

			// 2. Initialize policies
			if (this.config.enablePolicies) {
				await this.initializePolicies();
			}

			// 3. Initialize error handling
			if (this.config.enableErrorHandling) {
				await this.initializeErrorHandling();
			}

			// 4. Create render context
			await this.createRenderContext();

			// 5. Initialize building block renderer
			await this.initializeRenderer();

			// 6. Register all building blocks
			await this.registerBuildingBlocks();

			// 7. Set up integrations
			await this.setupIntegrations();

			this.initialized = true;
			console.log("✅ Integrated system initialized successfully");

			// Demo the system
			await this.runDemo();
		} catch (error) {
			console.error("❌ Failed to initialize integrated system:", error);
			throw error;
		}
	}

	/**
	 * Initializes the `OptimizationAccessControl` system and authenticates a mock user for demonstration.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeAccessControl() {
		console.log("🔐 Initializing Access Control...");

		OptimizationAccessControl.initialize({
			maxFailedAttempts: 3,
			sessionTimeout: 3600000, // 1 hour
			auditAllActions: true,
			requireMFA: false,
		});

		// Mock authentication for demo
		await OptimizationAccessControl.authenticateUser({
			username: "admin",
			password: "admin123",
		});

		console.log("✅ Access Control initialized");
	}

	/**
	 * Initializes the `SystemPolicies` manager and sets up a listener for policy changes.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializePolicies() {
		console.log("⚙️ Initializing Policies...");

		await SystemPolicies.initialize({
			environment: this.config.environment,
			validationEnabled: true,
			persistenceEnabled: true,
		});

		// Set up policy change listener
		SystemPolicies.addListener((event) => {
			console.log("📋 Policy Event:", event.type, event.data);

			// React to policy changes
			if (event.type === "policy_updated") {
				this.handlePolicyUpdate(event.data);
			}
		});

		console.log("✅ Policies initialized");
	}

	/**
	 * Initializes the `ErrorHelpers` and global error handlers, and registers error-related event flows.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeErrorHandling() {
		console.log("🚨 Initializing Error Handling...");

		// Set up global error handlers
		window.addEventListener("error", (event) => {
			const errorData = ErrorHelpers.formatError(event.error);
			this.handleError(errorData);
		});

		window.addEventListener("unhandledrejection", (event) => {
			const errorData = ErrorHelpers.formatError(event.reason);
			this.handleError(errorData);
		});

		// Register error flow definitions
		if (window.eventFlowEngine) {
			ERROR_FLOW_DEFINITIONS.forEach((flow) => {
				window.eventFlowEngine.registerFlow(flow);
			});
		}

		console.log("✅ Error Handling initialized");
	}

	/**
	 * Creates the main `RenderContext` instance, populating it with user, system, and environment information.
	 * @private
	 * @returns {Promise<void>}
	 */
	async createRenderContext() {
		console.log("🎨 Creating Render Context...");

		// Get current user info
		const user = OptimizationAccessControl.getCurrentUser();

		// Get current policies
		const policies = SystemPolicies.getAllPolicies();

		// Create context with all dependencies
		this.context = new RenderContext({
			// User context
			userId: user?.sessionId,
			userRole: user?.role || "guest",
			userPermissions: user?.permissions || [],

			// System context
			policies,
			stateManager: window.stateManager, // Assume available
			eventFlow: window.eventFlowEngine, // Assume available

			// Environment
			theme: "dark",
			environment: this.config.environment,

			// Device info
			viewport: {
				width: window.innerWidth,
				height: window.innerHeight,
			},
		});

		// Apply theme
		this.context.applyTheme();

		console.log("✅ Render Context created");
	}

	/**
	 * Initializes the `BuildingBlockRenderer`.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeRenderer() {
		console.log("🧱 Initializing Building Block Renderer...");

		this.renderer = new BuildingBlockRenderer(this.context.stateManager);

		// Add context reference
		this.renderer.context = this.context;

		console.log("✅ Building Block Renderer initialized");
	}

	/**
	 * Registers all necessary building blocks with the renderer.
	 * @private
	 * @returns {Promise<void>}
	 */
	async registerBuildingBlocks() {
		console.log("📦 Registering Building Blocks...");

		// Register performance overlay
		registerPerformanceOverlayBlock(this.renderer);

		// Register policy control
		registerPolicyControlBlock(this.renderer);

		// Register basic UI blocks
		this.registerBasicBlocks();

		console.log("✅ Building Blocks registered");
	}

	/**
	 * Registers a set of basic, general-purpose building blocks like text, buttons, and cards.
	 * @private
	 */
	registerBasicBlocks() {
		// Simple text block
		this.renderer.registerBlock("text", {
			render: ({ config, context }) => {
				const span = document.createElement("span");
				span.textContent = config.text || "";
				span.style.cssText = config.style || "";
				return span;
			},
		});

		// Button block
		this.renderer.registerBlock("button", {
			render: ({ config, context }) => {
				const button = document.createElement("button");
				button.textContent = config.text || "Button";
				button.style.cssText = `
          padding: 0.5rem 1rem;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          ${config.style || ""}
        `;

				if (config.onClick) {
					button.addEventListener("click", () => {
						if (typeof config.onClick === "string") {
							// Emit event
							context.eventFlow?.emit(
								config.onClick,
								config.eventData || {}
							);
						} else if (typeof config.onClick === "function") {
							config.onClick(config, context);
						}
					});
				}

				return button;
			},
		});

		// Card container block
		this.renderer.registerBlock("card", {
			render: ({ config, context }) => {
				const card = document.createElement("div");
				const theme = context.getThemeVariables();

				card.style.cssText = `
          background: ${theme["--surface-elevated"]};
          border: 1px solid ${theme["--border"]};
          border-radius: 8px;
          padding: 1rem;
          margin: 0.5rem;
          ${config.style || ""}
        `;

				if (config.title) {
					const title = document.createElement("h3");
					title.textContent = config.title;
					title.style.cssText = `
            margin: 0 0 1rem 0;
            color: ${theme["--text"]};
            font-size: 1.1rem;
          `;
					card.appendChild(title);
				}

				// Render children
				if (config.children) {
					config.children.forEach((child) => {
						const childElement = this.renderer.render(
							child,
							context
						);
						if (childElement) {
							card.appendChild(childElement);
						}
					});
				}

				return card;
			},
		});
	}

	/**
	 * Sets up integrations between different systems, such as connecting the error handler to the event flow
	 * and linking the access control checks to the renderer.
	 * @private
	 * @returns {Promise<void>}
	 */
	async setupIntegrations() {
		console.log("🔗 Setting up Integrations...");

		// Integrate error handling with event flow
		if (this.context.eventFlow) {
			this.context.eventFlow.on("error", (errorData) => {
				this.handleError(errorData);
			});
		}

		// Integrate access control with renderer
		this.renderer.checkAccess = (blockType, context) => {
			// Check if user can render this block type
			const restrictedBlocks = ["policy_control", "system_admin"];

			if (restrictedBlocks.includes(blockType)) {
				return OptimizationAccessControl.checkSessionPermission(
					"manage_policies"
				);
			}

			return true;
		};

		console.log("✅ Integrations set up");
	}

	/**
	 * Initializes the WebSocket server for real-time updates.
	 * @private
	 * @param {import('node:http').Server} httpServer - The HTTP server to attach to.
	 * @returns {Promise<void>}
	 */
	async initializeWebSocketServer(httpServer) {
		const { OptimizationWebSocketServer } = await import(
			"../core/OptimizationWebSocketServer.js"
		);
		this.wsServer = new OptimizationWebSocketServer(httpServer, {
			optimizer: window.databaseOptimizer, // Assume available
			accessControl: OptimizationAccessControl, // Pass the access control instance
		});
		this.wsServer.initialize();
	}
	/**
	 * Handles real-time updates to system policies, such as changing the theme or enabling debug mode.
	 * @private
	 * @param {object} data - The policy update event data.
	 */
	handlePolicyUpdate(data) {
		const { domain, key, newValue } = data;

		console.log(`Policy updated: ${domain}.${key} = ${newValue}`);

		// React to specific policy changes
		if (domain === "ui" && key === "dark_mode_default") {
			this.context.theme = newValue ? "dark" : "light";
			this.context.applyTheme();
		}

		if (domain === "system" && key === "enable_debug_mode") {
			if (newValue) {
				this.enableDebugMode();
			} else {
				this.disableDebugMode();
			}
		}
	}

	/**
	 * Processes an error using the centralized `ErrorHelpers`, which handles deduplication,
	 * notification creation, and auditing.
	 * @private
	 * @param {object} errorData - The formatted error data object.
	 */
	handleError(errorData) {
		// Check if error should be reported
		if (!ErrorHelpers.shouldReport(errorData)) {
			return;
		}

		// Store error for deduplication
		ErrorHelpers.storeError(errorData);

		// Create notification
		const notification = ErrorHelpers.createNotification(errorData);

		// Show notification through event system
		if (this.context.eventFlow) {
			this.context.eventFlow.emit("show_notification", notification);
		}

		// Log through audit system
		OptimizationAccessControl.auditUserAction(
			this.context.userRole,
			"error_handled",
			{
				errorId: errorData.id,
				level: errorData.level,
				message: errorData.message,
			}
		);
	}

	/**
	 * Runs a demonstration of the integrated system by rendering a dashboard and simulating
	 * policy changes, errors, and access control checks.
	 * @private
	 * @returns {Promise<void>}
	 */
	async runDemo() {
		console.log("🎬 Running System Demo...");

		// Create demo dashboard
		const dashboard = this.createDemoDashboard();

		// Render to page
		document.body.appendChild(dashboard);

		// Demo policy changes
		setTimeout(() => this.demoPolicyChanges(), 2000);

		// Demo error handling
		setTimeout(() => this.demoErrorHandling(), 4000);

		// Demo access control
		setTimeout(() => this.demoAccessControl(), 6000);
	}

	/**
	 * Creates the composition object for the demonstration dashboard.
	 * @private
	 * @returns {HTMLElement} The rendered dashboard element.
	 */
	createDemoDashboard() {
		const dashboardComposition = {
			type: "div",
			style: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
				gap: "1rem",
				padding: "1rem",
				minHeight: "100vh",
				background: "var(--surface)",
			},
			children: [
				{
					type: "card",
					config: {
						title: "🎯 System Overview",
						children: [
							{
								type: "text",
								config: {
									text: "Integrated Nodus V7.1 System",
									style: "font-weight: bold; display: block; margin-bottom: 0.5rem;",
								},
							},
							{
								type: "text",
								config: {
									text: `Environment: ${this.config.environment}`,
									style: "display: block; margin-bottom: 0.25rem;",
								},
							},
							{
								type: "text",
								config: {
									text: `User: ${this.context.userRole}`,
									style: "display: block; margin-bottom: 0.25rem;",
								},
							},
							{
								type: "button",
								config: {
									text: "Test System",
									onClick: "test_system",
									style: "margin-top: 1rem;",
								},
							},
						],
					},
				},

				{
					type: "performance_overlay",
					config: {
						title: "📊 Performance Monitor",
						refreshRate: 3000,
						overlay: false,
					},
				},

				{
					type: "policy_control",
					config: {
						title: "⚙️ Policy Control",
						maxHeight: "600px",
					},
				},

				{
					type: "card",
					config: {
						title: "🔐 Security Status",
						children: [
							{
								type: "text",
								config: {
									text: "Access Control: Active",
									style: "color: var(--success); display: block; margin-bottom: 0.5rem;",
								},
							},
							{
								type: "text",
								config: {
									text: "Audit Logging: Enabled",
									style: "color: var(--success); display: block; margin-bottom: 0.5rem;",
								},
							},
							{
								type: "button",
								config: {
									text: "View Audit Log",
									onClick: () => {
										const audit =
											OptimizationAccessControl.getAuditLog(
												{
													limit: 10,
												}
											);
										console.table(audit);
									},
									style: "margin-top: 1rem;",
								},
							},
						],
					},
				},
			],
		};

		return this.renderer.render(dashboardComposition, this.context);
	}

	/**
	 * Demonstrates programmatic changes to system policies.
	 * @private
	 * @returns {Promise<void>}
	 */
	async demoPolicyChanges() {
		console.log("🎭 Demo: Policy Changes");

		try {
			await SystemPolicies.update("ui", "enable_animations", false);
			await SystemPolicies.update("system", "enable_debug_mode", true);

			console.log("✅ Policy changes applied");
		} catch (error) {
			console.error("❌ Policy change failed:", error);
		}
	}

	/**
	 * Demonstrates the centralized error handling by triggering various types of errors.
	 * @private
	 */
	demoErrorHandling() {
		console.log("🎭 Demo: Error Handling");

		// Trigger different types of errors
		setTimeout(() => {
			const error = new Error("Demo validation error");
			error.name = "ValidationError";
			error.context = { field: "email", value: "invalid" };
			window.dispatchEvent(new ErrorEvent("error", { error }));
		}, 1000);

		setTimeout(() => {
			const error = new Error("Demo network timeout");
			error.name = "NetworkError";
			error.url = "/api/demo";
			error.status = 408;
			window.dispatchEvent(new ErrorEvent("error", { error }));
		}, 2000);
	}

	/**
	 * Demonstrates the access control system by checking various permissions and domain access.
	 * @private
	 */
	demoAccessControl() {
		console.log("🎭 Demo: Access Control");

		// Test permissions
		const canManagePolicies =
			OptimizationAccessControl.checkSessionPermission("manage_policies");
		console.log("Can manage policies:", canManagePolicies);

		// Test domain access
		const domains = ["system", "ui", "events", "user", "meta"];
		domains.forEach((domain) => {
			const canAccess =
				OptimizationAccessControl.checkDomainAccess(domain);
			console.log(`Can access ${domain}:`, canAccess);
		});

		// Show security metrics
		const metrics = OptimizationAccessControl.getSecurityMetrics();
		console.log("Security metrics:", metrics);
	}

	/**
	 * Enables a visual debug mode indicator on the UI.
	 * @private
	 */
	enableDebugMode() {
		console.log("🐛 Debug mode enabled");
		document.body.classList.add("debug-mode");

		// Add debug overlay
		const debugOverlay = document.createElement("div");
		debugOverlay.id = "debug-overlay";
		debugOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(255, 0, 0, 0.8);
      color: white;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
    `;
		debugOverlay.textContent = "DEBUG MODE";
		document.body.appendChild(debugOverlay);
	}

	/**
	 * Disables the visual debug mode indicator.
	 * @private
	 */
	disableDebugMode() {
		console.log("🐛 Debug mode disabled");
		document.body.classList.remove("debug-mode");

		const debugOverlay = document.getElementById("debug-overlay");
		if (debugOverlay) {
			debugOverlay.remove();
		}
	}

	/**
	 * Retrieves a comprehensive status object for the entire integrated system.
	 * @public
	 * @returns {object} A system status object.
	 */
	getSystemStatus() {
		return {
			initialized: this.initialized,
			accessControl: {
				active: !!OptimizationAccessControl.currentSession,
				user: OptimizationAccessControl.getCurrentUser(),
				metrics: OptimizationAccessControl.getSecurityMetrics(),
			},
			policies: {
				initialized: !!SystemPolicies.policies,
				statistics: SystemPolicies.getStatistics(),
				environment: SystemPolicies.environment,
			},
			renderer: {
				blocksRegistered: this.renderer?.blocks?.size || 0,
				layoutsRegistered: this.renderer?.layouts?.size || 0,
			},
			context: {
				userRole: this.context?.userRole,
				theme: this.context?.theme,
				environment: this.context?.environment,
			},
		};
	}

	/**
	 * Cleans up all system resources and event listeners.
	 * @public
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		console.log("🧹 Cleaning up system...");

		// Clear session
		OptimizationAccessControl.clearSession();

		// Clear policies listeners
		SystemPolicies.listeners.clear();

		// Remove event listeners
		window.removeEventListener("error", this.handleError);
		window.removeEventListener("unhandledrejection", this.handleError);

		this.initialized = false;
		console.log("✅ System cleaned up");
	}
}

// Export factory function for easy usage
/**
 * A factory function to create and return an instance of the `IntegratedSystemExample`.
 * @param {object} [config={}] - Configuration options for the system.
 * @returns {IntegratedSystemExample} A new instance of the integrated system.
 */
export function createIntegratedSystem(config = {}) {
	return new IntegratedSystemExample(config);
}

export default IntegratedSystemExample;
