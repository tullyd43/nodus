import { SystemBootstrap } from "@core/SystemBootstrap.js";

import { AppConfig } from "../environment.config.js";
import { DeveloperDashboard } from "./ui/DeveloperDashboard.js";

import { ActionDispatcher } from "@/ui/ActionDispatcher.js";
import { BindEngine } from "@/ui/BindEngine.js";
import SecurityExplainer from "@/ui/SecurityExplainer.js";


/**
 * @file d:\Development Files\repositories\nodus\src\main.js
 * @description This is the entry point for the Nodus application.
 * It initializes the HybridStateManager, sets up the main UI grid,
 * and starts the application's core functionalities.
 */

/**
 * @function bootstrap
 * @description Asynchronously initializes the Nodus application.
 * It sets up the global `HybridStateManager` instance and renders the main `GridBootstrap` component.
 * @returns {Promise<void>} A promise that resolves when the application has been successfully bootstrapped.
 */
const bootstrap = async () => {
	// Guard against concurrent bootstraps (HMR/dev tools)
	if (window.__bootstrappingNodus) return;
	window.__bootstrappingNodus = true;

	if (window.nodusApp) {
		console.warn(
			"[Nodus] Application already initialized. Skipping bootstrap."
		);
		return;
	}

	console.log("🚀 Nodus Grid Data Layer Test Starting...");

	// 1. Use the new SystemBootstrap to initialize the application
	const bootstrapApp = new SystemBootstrap({
		...AppConfig, // Use the centralized configuration
	});

	// 2. Initialize with a default user context for demo mode
	const t0 = performance.now();
	const stateManager = await bootstrapApp.initialize({
		userId: "demo-user",
		clearanceLevel: "internal",
	});
	const bootstrapDuration = performance.now() - t0;
	console.info(`⏱️ Bootstrap complete in ${bootstrapDuration.toFixed(1)}ms`);
	try {
		stateManager.emit && stateManager.emit('metrics', { type: 'bootstrap', duration: bootstrapDuration });
	} catch { /* noop */ }

	window.nodusApp = stateManager;

	// 3. V8.0 Parity: Create a simple appViewModel that holds the stateManager as the source of truth.
	// The UI layer can now access all managers and state directly from the stateManager instance.
	const appViewModel = {
		hybridStateManager: stateManager,
		// The context object is no longer needed, as the UI can access managers
		// directly via `appViewModel.hybridStateManager.managers`.
	};
	window.appViewModel = appViewModel;

	// Resolve policies manager once
	const policies = stateManager?.managers?.policies;

	// Build a read-only capability map for quick inspection
	try {
		const capabilities = {
			hasSigner: !!stateManager?.signer,
			hasIndexedDB: !!stateManager?.storage?.ready,
			policies: {
				ui: {
					enable_security_hud: !!policies?.getPolicy?.('ui', 'enable_security_hud'),
					enable_virtual_list: (function(){ const v = policies?.getPolicy?.('ui','enable_virtual_list'); return typeof v === 'boolean' ? v : true; })(),
				},
				grid: {
					enable_analytics: (function(){ const g = policies?.getPolicy?.('grid','enable_analytics'); return typeof g === 'boolean' ? g : true; })(),
				},
				security: {
					allow_client_policy_updates: !!policies?.getPolicy?.('security','allow_client_policy_updates'),
					policy_admin_permission: policies?.getPolicy?.('security','policy_admin_permission') || 'policy.admin',
				},
			},
		};
		Object.freeze?.(capabilities.policies.ui);
		Object.freeze?.(capabilities.policies.grid);
		Object.freeze?.(capabilities.policies.security);
		Object.freeze?.(capabilities.policies);
		// Attach temporarily; will be included in Nodus exposure below
		window.__nodusCapabilities = capabilities;
	} catch { /* noop */ }

	// 4. V8.0 Parity: Initialize the fully integrated grid system via the state manager.
	// The service is already instantiated by the ServiceRegistry. We just need to initialize it.
	const gridSystem = stateManager.managers.completeGridSystem;
	// The appViewModel and gridContainer are now passed during the service's own initialization.
	try {
		if (!gridSystem?.isInitialized || !gridSystem.isInitialized()) {
			const g0 = performance.now();
			await gridSystem.initialize();
			const gridInitDuration = performance.now() - g0;
			console.info(`⏱️ Grid initialized in ${gridInitDuration.toFixed(1)}ms`);
			try {
				// Gate grid analytics with policy (default: enabled)
				let enableGridAnalytics;
				try { enableGridAnalytics = policies?.getPolicy?.('grid', 'enable_analytics'); } catch { /* noop */ }
				if (enableGridAnalytics !== false) {
					stateManager.emit && stateManager.emit('metrics', { type: 'grid_init', duration: gridInitDuration });
				}
			} catch { /* noop */ }
		}
	} catch (err) {
		console.error("[Grid] Initialization failed:", err);
	}

	// 4.a Dev: blank grid canvas using default config + center block with reusable button
	try {
		const configId = 'dev-default';
		const cols = Number(stateManager?.managers?.policies?.getPolicy('grid','default_columns') ?? 24);
		const w = 6, h = 4, x = Math.max(0, Math.floor((cols - w)/2)), y = 2;
		const defaultConfig = {
			blocks: [
				{
					id: 'starter', type: 'button', x, y, w, h,
					constraints: { minW:2, minH:2, maxW:cols, maxH:1000 },
					props: { label: 'Add Block', mode: 'modal', variant: 'primary' },
				}
			]
		};
		await gridSystem.setRuntimeConfig(defaultConfig, configId);
	} catch { /* noop */ }

	// 4.5 Initialize UI binding and action dispatch
	const bindEngine = new BindEngine(stateManager);
	bindEngine.init(document);
	const dispatcher = new ActionDispatcher({ hybridStateManager: stateManager });
	dispatcher.attach(document);

	// 4.6 Lightweight event bridge for simple [data-bind] bindings (policy-gated)
	let unsubscribeBindBridge = null;
	try {
		const policies = stateManager?.managers?.policies;
		let bridgeEnabled;
		let updateInputs;
		try {
			bridgeEnabled = policies?.getPolicy?.("ui", "enable_bind_bridge");
			updateInputs = policies?.getPolicy?.("ui", "bind_bridge_update_inputs");
		} catch { /* noop */ }

		// Defaults: enabled in dev; input updates enabled in dev
		if (typeof bridgeEnabled !== "boolean") bridgeEnabled = !!(import.meta.env?.DEV);
		if (typeof updateInputs !== "boolean") updateInputs = !!(import.meta.env?.DEV);

		if (bridgeEnabled && stateManager.on) {
			const handler = ({ path, value }) => {
				const list = document?.querySelectorAll?.(`[data-bind="${path}"]`);
				if (!list || list.length === 0) return;
				for (const el of list) {
					// If element is a form field and input updates are allowed, set value (avoid clobbering active input)
					const isFormField = updateInputs && el && el.nodeType === 1 && typeof el.matches === "function" && el.matches("input, textarea, select");
					if (isFormField) {
						if (document.activeElement !== el) {
							el.value = value == null ? "" : String(value);
						}
					} else {
						// Basic text content update
						el.textContent = value == null ? "" : String(value);
					}
				}
			};
			const maybeUnsub = stateManager.on("stateChange", handler);
			if (typeof maybeUnsub === "function") unsubscribeBindBridge = maybeUnsub;
		}
	} catch { /* noop */ }

	// 5) Dev-only Security HUD with hardened exposure
	let hud = null;
	// Policy default: enabled in dev/local if undefined
	let enableHud;
	try { enableHud = policies?.getPolicy?.('ui', 'enable_security_hud'); } catch { /* noop */ }
	if (typeof enableHud !== 'boolean') enableHud = !!(import.meta.env?.DEV || window.location.hostname === 'localhost');
	if (enableHud) {
		hud = new SecurityExplainer({ hybridStateManager: stateManager });
    try {
      Object.defineProperty(window, "__securityHUD", {
        value: {
          toggle: () => hud.toggle(),
          clear: () => hud.clear(),
        },
        configurable: false,
        enumerable: false,
      });
    } catch {
      /* noop */
    }
  }

	// 6) Virtualized list setup (lazy-loaded via IntersectionObserver)
	let vlist = null;
	const container = document.querySelector("#virtual-grid");
	// Gate VirtualList behind policy (default: enabled)
	let enableVL;
	try { enableVL = policies?.getPolicy?.('ui', 'enable_virtual_list'); } catch { /* noop */ }
	if (typeof enableVL !== 'boolean') enableVL = true;

	// Shared data buffer and handler so events before mount are captured
	const vlistData = [];
	const onEntitiesLoaded = ({ result }) => {
		const arr = (result && Array.isArray(result)) ? result : [];
		vlistData.splice(0, vlistData.length, ...arr);
		try { vlist?.refresh?.(); } catch { /* noop */ }
	};
	if (enableVL) {
		stateManager.on && stateManager.on("entitiesLoaded", onEntitiesLoaded);
	}

	async function createVirtualListOnce() {
		if (!container || vlist) return;
		try {
			const { default: VirtualList } = await import("@/ui/VirtualList.js");
			vlist = new VirtualList({
				container,
				itemHeight: 44,
				count: () => vlistData.length,
				keyOf: (i) => vlistData[i]?.id ?? i,
				render: (el, i) => {
					const row = vlistData[i];
					el.className = "row";
					el.innerHTML = `
					  <div class="title monos">${row?.title ?? row?.id ?? i}</div>
					  <div class="meta">${row?.entity_type ?? ""}</div>
					`;
				},
			});
			vlist.mount();
			try { vlist.refresh(); } catch { /* noop */ }
			window.__vlistData = vlistData;
		} catch (e) {
			console.warn("[Nodus] VirtualList failed to load:", e);
		}
	}

	if (container && enableVL) {
		try {
			if ('IntersectionObserver' in window) {
				const io = new IntersectionObserver((entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							io.unobserve(container);
							io.disconnect();
							createVirtualListOnce();
							break;
						}
					}
				}, { root: null, threshold: 0.1 });
				io.observe(container);
			} else {
				await createVirtualListOnce();
			}
		} catch { /* noop */ }
	}

	console.log("✅ Complete Grid System Initialized. Application is ready.");
	console.log("%cNODUS READY", "color:#80ffaa;font-weight:bold");

  // 7) Developer dashboard (configurable and secure) and scoped global namespace
  let dashboard = null;
  try {
    const isLocalDev = import.meta.env?.DEV || window.location.hostname === "localhost";
    const policies = stateManager?.managers?.policies;
    const securityManager = stateManager?.managers?.securityManager;
    const subject = securityManager?.getSubject?.() || {};

    // Policy toggle (optional): system.enable_developer_dashboard
    let policyEnabled = undefined;
    try {
      policyEnabled = policies?.getPolicy?.("system", "enable_developer_dashboard");
    } catch { /* noop */ }

    // Default: enabled only in dev/local if no policy defined
    const featureEnabled = typeof policyEnabled === "boolean" ? policyEnabled : isLocalDev;

    // Permission gate (configurable name, default 'dev.dashboard.view')
    // Optional policy override: system.developer_dashboard_permission
    let requiredPerm = "dev.dashboard.view";
    try {
      const configured = policies?.getPolicy?.("system", "developer_dashboard_permission");
      if (configured && typeof configured === "string") requiredPerm = configured;
    } catch { /* noop */ }

    const hasPermission = Array.isArray(subject?.permissions)
      ? subject.permissions.includes(requiredPerm)
      : (subject?.role === "admin"); // fallback: admins may pass

    const d0 = performance.now();
    if (featureEnabled && hasPermission) {
      dashboard = new DeveloperDashboard(document.body, { stateManager });
    } else {
      console.debug(
        "[DevDashboard] Suppressed (enabled:",
        featureEnabled,
        ", perm:", requiredPerm,
        ", hasPerm:", hasPermission,
        ")"
      );
    }
    try {
      const dashDuration = performance.now() - d0;
      stateManager.emit && stateManager.emit('metrics', { type: 'bootstrap.stage', stage: 'dashboard', duration: dashDuration });
    } catch { /* noop */ }
    } catch { /* noop */ }

  // Securely expose a minimal namespace (policy-gated)
  try {
    const policies = stateManager?.managers?.policies;
    const isDev = !!(import.meta.env?.DEV || window.location.hostname === "localhost");
    let exposeGlobal;
    try { exposeGlobal = policies?.getPolicy?.("security", "expose_global_namespace"); } catch { /* noop */ }
    const shouldExpose = typeof exposeGlobal === "boolean" ? exposeGlobal : isDev;
    if (shouldExpose) {
      const exposed = { state: stateManager, hud, vlist, dashboard, capabilities: (window.__nodusCapabilities || {}) };
      Object.freeze?.(exposed);
      Object.defineProperty(window, "Nodus", {
        value: exposed,
        configurable: false,
        enumerable: false,
        writable: false,
      });
    }
  } catch { /* noop */ }

	// 8) HMR/teardown cleanup hooks
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      try { vlist?.unmount?.(); } catch { /* noop */ }
      try { hud?.dispose?.(); } catch { /* noop */ }
      try { window.nodusApp?.dispose?.(); } catch { /* noop */ }
      try { unsubscribeBindBridge?.(); } catch { /* noop */ }
      try { stateManager?.managers?.forensicLogger?.cleanup?.(); } catch { /* noop */ }
      try { delete window.Nodus; } catch { /* noop */ }
    });
  }
};

// Lightweight global error forwarding (policy-gated)
try {
  const policies = window.nodusApp?.managers?.policies;
  let reportErrors;
  try { reportErrors = policies?.getPolicy?.("security", "report_unhandled_errors"); } catch { /* noop */ }
  const enabled = typeof reportErrors === "boolean" ? reportErrors : !!(import.meta.env?.DEV);
  if (enabled) {
    const forward = (errObj) => {
      try {
        const ErrorHelpers = window.nodusApp?.managers?.errorHelpers || window.nodusApp?.managers?.ErrorHelpers;
        const message = errObj?.reason?.message || errObj?.message || String(errObj?.reason || errObj);
        ErrorHelpers?.handleError?.(message, errObj?.error || errObj?.reason || errObj);
      } catch { /* noop */ }
    };
    window.addEventListener?.("error", (e) => forward(e));
    window.addEventListener?.("unhandledrejection", (e) => forward(e));
  }
} catch { /* noop */ }

bootstrap().finally(() => {
	window.__bootstrappingNodus = false;
});
