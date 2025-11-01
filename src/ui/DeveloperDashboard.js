import { BoundedStack } from "../utils/BoundedStack.js";
import { DateCore } from "../utils/DateUtils.js";

// Policies that are readonly in production (UI disabled)
const PROD_BLOCKED_POLICIES = new Set(["security.expose_global_namespace"]);

/**
 * @class DeveloperDashboard
 * @description A floating UI component that provides a real-time view of application
 * performance and custom metrics by hooking into the application's state manager.
 * @privateFields {#container, #stateManager, #reporter, #options, #updateInterval, #eventLog, #dashboardElement, #toggleBtn, #perfMetrics, #coreMetricsContainer, #eventLogContainer, #unsubscribe}
 */
export class DeveloperDashboard {
	// Private fields for encapsulation
	#container;
	#stateManager;
	#reporter;
	#perfMetrics = {};
	#options;
	#updateInterval = null;
	#eventLog = new BoundedStack(50);
	#dashboardElement;
	#toggleBtn;
	#perfMetricsContainer;
	#coreMetricsContainer;
	#eventLogContainer;
	#policyToggleExposeGlobal;
	#policyToggleReportErrors;
	#policyToggleEnableHud;
	#policyToggleEnableVL;
	#policyToggleGridAnalytics;
	#flagSummaryEl;
	#policySnapshotPre;
	#snapshotModeFull = false;
	#snapshotIncludePatterns = [];
	#bootstrapStages = [];
	#bootstrapStagesContainer;
	#stagesChart = null;
	#stagesChartCanvas = null;
	#stagesChartVisible = true;
	#unsubscribe = [];
	#canClientUpdate = true;
	#policyStatusEl;
	#policyAdminPermission = "policy.admin";

	#applyReadonlyIfProd(policyPath, checkboxEl, rowEl) {
		try {
			const isProd = !!import.meta?.env?.PROD;
			if (isProd && PROD_BLOCKED_POLICIES.has(policyPath)) {
				checkboxEl.disabled = true;
				checkboxEl.title = "Disabled in production by policy validator";
				rowEl.classList.add("readonly");
				const badge = document.createElement("span");
				badge.className = "badge readonly-badge";
				badge.textContent = "readonly";
				rowEl.appendChild(badge);
			}
		} catch {
			/* noop */
		}
	}

	#applyLockedIfClientUpdatesDisabled(checkboxEl, rowEl) {
		if (!this.#canClientUpdate) {
			checkboxEl.disabled = true;
			rowEl.classList.add("readonly");
			const badge = document.createElement("span");
			badge.className = "badge readonly-badge";
			badge.textContent = "locked";
			rowEl.appendChild(badge);
		}
	}

	/**
	 * Creates an instance of DeveloperDashboard.
	 * @param {HTMLElement} container - The DOM element to which the dashboard will be appended.
	 * @param {object} dependencies - The required dependencies for the dashboard.
	 * @param {import('../core/HybridStateManager.js').default} dependencies.stateManager - The application's HybridStateManager instance.
	 * @param {object} [options={}] - Configuration options.
	 * @param {boolean} [options.startOpen=false] - Whether the dashboard should be open by default.
	 */
	constructor(container, { stateManager }, options = {}) {
		if (!container || !stateManager) {
			throw new Error(
				"DeveloperDashboard requires a container element and a StateManager instance."
			);
		}

		this.#container = container;
		this.#stateManager = stateManager;

		// V8.0 Parity: Check user role for access.
		const userRole =
			this.#stateManager.managers.securityManager?.getSubject()?.role;
		if (!["admin", "developer"].includes(userRole)) {
			console.log(
				"[DevDashboard] User does not have permission to view the developer dashboard."
			);
			return; // Do not initialize for unauthorized users.
		}

		// V8.0 Parity: Derive dependencies from stateManager.
		this.#reporter = this.#stateManager.managers.metricsReporter;
		if (!this.#reporter) {
			console.warn(
				"[DevDashboard] MetricsReporter not found in stateManager. Dashboard will be limited."
			);
		}

		this.#options = {
			startOpen: false,
			...options,
		};

		this.#initStyles();
		this.#render();
		this.#attachEventListeners();
		this.#subscribeToEvents();

		// Emit initial policy status to event log
		try {
			const policies = this.#stateManager?.managers?.policies;
			const canUpdatePolicy = policies?.getPolicy?.(
				"security",
				"allow_client_policy_updates"
			);
			const subject =
				this.#stateManager?.managers?.securityManager?.getSubject?.() ||
				{};
			const hasPermission = Array.isArray(subject.permissions)
				? subject.permissions.includes(this.#policyAdminPermission)
				: subject.role === "admin";
			const prod = !!import.meta?.env?.PROD;
			let reason = "";
			if (!this.#canClientUpdate) {
				if (prod) reason = "prod";
				if (canUpdatePolicy === false) reason = reason || "policy";
				if (!hasPermission) reason = reason || "no permission";
			}
			this.#logEvent("policy_status", {
				status: this.#canClientUpdate ? "enabled" : "locked",
				reason,
				permission: this.#policyAdminPermission,
				env: prod ? "prod" : "dev",
			});
		} catch {
			/* noop */
		}

		if (this.#options.startOpen) {
			this.open();
		}
	}

	/**
	 * Renders the initial structure of the dashboard component.
	 * @private
	 */
	#render() {
		// Create main container
		this.#dashboardElement = document.createElement("div");
		this.#dashboardElement.className = "dev-dashboard";
		if (!this.#options.startOpen) {
			this.#dashboardElement.classList.add("collapsed");
		}

		// Header
		const header = document.createElement("div");
		header.className = "dashboard-header";
		const title = document.createElement("h3");
		title.textContent = "Dev Dashboard";
		// Compact flags summary (HUD/VL/Analytics)
		this.#flagSummaryEl = document.createElement("span");
		this.#flagSummaryEl.className = "flag-summary";
		this.#toggleBtn = document.createElement("button");
		this.#toggleBtn.className = "dashboard-toggle-btn";
		this.#toggleBtn.textContent = this.#options.startOpen
			? "Collapse"
			: "Expand";
		header.append(title, this.#flagSummaryEl, this.#toggleBtn);

		// Content Area
		const content = document.createElement("div");
		content.className = "dashboard-content";

		// --- Performance Section ---
		const perfSection = document.createElement("div");
		perfSection.className = "dashboard-section";
		this.#perfMetricsContainer = document.createElement("div");
		this.#perfMetricsContainer.id = "perf-metrics";
		this.#perfMetrics.fps = this.#createPerfItem("FPS", "N/A");
		this.#perfMetrics.latency = this.#createPerfItem("Latency", "N/A");
		this.#perfMetrics.memory = this.#createPerfItem("Memory", "N/A");
		perfSection.appendChild(this.#perfMetricsContainer);

		// --- Core Metrics Section ---
		const coreSection = document.createElement("div");
		coreSection.className = "dashboard-section";
		const coreTitle = document.createElement("h4");
		coreTitle.textContent = "Core Metrics";
		this.#coreMetricsContainer = document.createElement("div");
		this.#coreMetricsContainer.className = "metrics-table-container";
		this.#coreMetricsContainer.textContent = "No data";
		coreSection.append(coreTitle, this.#coreMetricsContainer);

		// --- Policy Controls Section ---
		const policySection = document.createElement("div");
		policySection.className = "dashboard-section";
		const policyTitle = document.createElement("h4");
		policyTitle.textContent = "Policies";
		const policyWrap = document.createElement("div");
		policyWrap.className = "policy-controls";

		// Read current values safely
		let exposeGlobal = false;
		let reportErrors = false;
		let canUpdatePolicy;
		let policyAdminPermission = "policy.admin";
		try {
			const policies = this.#stateManager?.managers?.policies;
			exposeGlobal = !!policies?.getPolicy?.(
				"security",
				"expose_global_namespace"
			);
			reportErrors = !!policies?.getPolicy?.(
				"security",
				"report_unhandled_errors"
			);
			canUpdatePolicy = policies?.getPolicy?.(
				"security",
				"allow_client_policy_updates"
			);
			const configuredPerm = policies?.getPolicy?.(
				"security",
				"policy_admin_permission"
			);
			if (configuredPerm && typeof configuredPerm === "string")
				policyAdminPermission = configuredPerm;
		} catch {
			/* noop */
		}
		const isDev = !!(
			import.meta?.env?.DEV || window.location.hostname === "localhost"
		);
		let hasPermission = false;
		try {
			const subject =
				this.#stateManager?.managers?.securityManager?.getSubject?.() ||
				{};
			hasPermission = Array.isArray(subject.permissions)
				? subject.permissions.includes(policyAdminPermission)
				: subject.role === "admin";
		} catch {
			/* noop */
		}
		this.#canClientUpdate =
			(typeof canUpdatePolicy === "boolean" ? canUpdatePolicy : isDev) &&
			!!hasPermission;
		this.#policyAdminPermission = policyAdminPermission;

		// Expose Global Namespace toggle
		const exposeRow = document.createElement("label");
		exposeRow.style.display = "flex";
		exposeRow.style.alignItems = "center";
		exposeRow.style.gap = "8px";
		const exposeCb = document.createElement("input");
		exposeCb.type = "checkbox";
		exposeCb.checked = exposeGlobal;
		const exposeTxt = document.createElement("span");
		exposeTxt.textContent = "security.expose_global_namespace (dev only)";
		exposeTxt.title =
			"Expose window.Nodus. Disallowed in production by policy validator.";
		this.#applyReadonlyIfProd(
			"security.expose_global_namespace",
			exposeCb,
			exposeRow
		);
		this.#applyLockedIfClientUpdatesDisabled(exposeCb, exposeRow);
		exposeRow.append(exposeCb, exposeTxt);

		// Report unhandled errors toggle
		const reportRow = document.createElement("label");
		reportRow.style.display = "flex";
		reportRow.style.alignItems = "center";
		reportRow.style.gap = "8px";
		const reportCb = document.createElement("input");
		reportCb.type = "checkbox";
		reportCb.checked = reportErrors;
		const reportTxt = document.createElement("span");
		reportTxt.textContent = "security.report_unhandled_errors";
		reportTxt.title =
			"Forward window errors and unhandled rejections to ErrorHelpers.";
		this.#applyReadonlyIfProd(
			"security.report_unhandled_errors",
			reportCb,
			reportRow
		);
		this.#applyLockedIfClientUpdatesDisabled(reportCb, reportRow);
		reportRow.append(reportCb, reportTxt);

		// UI feature: Security HUD toggle
		let enableHud = false;
		let enableVL = true;
		let gridAnalytics = true;
		try {
			const policies = this.#stateManager?.managers?.policies;
			enableHud = !!policies?.getPolicy?.("ui", "enable_security_hud");
			const vlVal = policies?.getPolicy?.("ui", "enable_virtual_list");
			if (typeof vlVal === "boolean") enableVL = vlVal; // default true
			const gaVal = policies?.getPolicy?.("grid", "enable_analytics");
			if (typeof gaVal === "boolean") gridAnalytics = gaVal; // default true
		} catch {
			/* noop */
		}

		const hudRow = document.createElement("label");
		hudRow.style.display = "flex";
		hudRow.style.alignItems = "center";
		hudRow.style.gap = "8px";
		const hudCb = document.createElement("input");
		hudCb.type = "checkbox";
		hudCb.checked = enableHud;
		const hudTxt = document.createElement("span");
		hudTxt.textContent = "ui.enable_security_hud";
		hudRow.append(hudCb, hudTxt);
		this.#applyLockedIfClientUpdatesDisabled(hudCb, hudRow);

		// UI feature: Virtual List toggle
		const vlRow = document.createElement("label");
		vlRow.style.display = "flex";
		vlRow.style.alignItems = "center";
		vlRow.style.gap = "8px";
		const vlCb = document.createElement("input");
		vlCb.type = "checkbox";
		vlCb.checked = enableVL;
		const vlTxt = document.createElement("span");
		vlTxt.textContent = "ui.enable_virtual_list";
		vlRow.append(vlCb, vlTxt);
		this.#applyLockedIfClientUpdatesDisabled(vlCb, vlRow);

		// Grid feature: Analytics toggle
		const gaRow = document.createElement("label");
		gaRow.style.display = "flex";
		gaRow.style.alignItems = "center";
		gaRow.style.gap = "8px";
		const gaCb = document.createElement("input");
		gaCb.type = "checkbox";
		gaCb.checked = gridAnalytics;
		const gaTxt = document.createElement("span");
		gaTxt.textContent = "grid.enable_analytics";
		gaRow.append(gaCb, gaTxt);
		this.#applyLockedIfClientUpdatesDisabled(gaCb, gaRow);

		// Update compact flags summary now that we have values
		this.#updateFlagSummary({
			hud: enableHud,
			vl: enableVL,
			ga: gridAnalytics,
		});

		// Status line for client policy update capability
		const statusLine = document.createElement("div");
		statusLine.className = "status-line";
		this.#policyStatusEl = statusLine;
		this.#updatePolicyStatusLine({
			can: this.#canClientUpdate,
			isDev,
			hasPermission,
			canUpdatePolicy,
		});

		// Dev-only policy snapshot block
		const snapWrap = document.createElement("div");
		snapWrap.className = "policy-snapshot";
		const snapHeader = document.createElement("div");
		snapHeader.className = "policy-snapshot-header";
		snapHeader.textContent = "Policy snapshot (dev) ";
		// Full toggle (dev-only)
		const snapFull = document.createElement("label");
		snapFull.style.marginLeft = "8px";
		const fullCb = document.createElement("input");
		fullCb.type = "checkbox";
		// restore persisted preference
		try {
			const savedMode = localStorage.getItem("devdash.snapshot.full");
			if (savedMode != null) this.#snapshotModeFull = savedMode === "1";
		} catch {
			/* noop */
		}
		fullCb.checked = this.#snapshotModeFull;
		const fullTxt = document.createElement("span");
		fullTxt.textContent = "full";
		snapFull.append(fullCb, fullTxt);
		fullCb.addEventListener("change", () => {
			this.#snapshotModeFull = !!fullCb.checked;
			try {
				localStorage.setItem(
					"devdash.snapshot.full",
					this.#snapshotModeFull ? "1" : "0"
				);
			} catch {
				/* noop */
			}
			this.#updatePolicySnapshot();
		});
		const snapCopy = document.createElement("button");
		snapCopy.type = "button";
		snapCopy.className = "link-btn";
		snapCopy.textContent = "copy";
		snapCopy.title = "Copy snapshot JSON";
		snapCopy.addEventListener("click", async () => {
			try {
				const text =
					this.#policySnapshotPre?.textContent ||
					JSON.stringify(this.#buildPolicySnapshot(), null, 2);
				if (navigator?.clipboard?.writeText) {
					await navigator.clipboard.writeText(text);
				} else {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					document.body.removeChild(ta);
				}
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.success?.("Policy snapshot copied");
				} catch {
					/* noop */
				}
			} catch (err) {
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.error?.("Failed to copy snapshot");
				} catch {
					/* noop */
				}
				console.warn("[DevDashboard] Copy snapshot failed:", err);
			}
		});
		const snapCopyAll = document.createElement("button");
		snapCopyAll.type = "button";
		snapCopyAll.className = "link-btn";
		snapCopyAll.textContent = "copy all";
		snapCopyAll.title = "Copy ALL policies (dev)";
		snapCopyAll.addEventListener("click", async () => {
			try {
				const pm = this.#stateManager?.managers?.policies;
				const all = pm?.getAllPolicies
					? pm.getAllPolicies()
					: this.#buildPolicySnapshot();
				const text = JSON.stringify(all, null, 2);
				if (navigator?.clipboard?.writeText) {
					await navigator.clipboard.writeText(text);
				} else {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					document.body.removeChild(ta);
				}
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.success?.("All policies copied");
				} catch {
					/* noop */
				}
			} catch (err) {
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.error?.("Failed to copy all policies");
				} catch {
					/* noop */
				}
				console.warn("[DevDashboard] Copy all policies failed:", err);
			}
		});
		const snapPre = document.createElement("pre");
		this.#policySnapshotPre = snapPre;
		this.#updatePolicySnapshot();
		// Presets dropdown for include patterns
		const snapPreset = document.createElement("select");
		snapPreset.className = "preset-select";
		const presets = [
			{ label: "presets", value: "", disabled: true },
			{ label: "All keys (*)", value: "*" },
			{ label: "UI only (ui.*)", value: "ui.*" },
			{ label: "Security only (security.*)", value: "security.*" },
			{ label: "Grid only (grid.*)", value: "grid.*" },
			{
				label: "Core flags (HUD, VL, GA)",
				value: "ui.enable_security_hud, ui.enable_virtual_list, grid.enable_analytics",
			},
		];
		for (const p of presets) {
			const opt = document.createElement("option");
			opt.textContent = p.label;
			opt.value = p.value;
			if (p.disabled) opt.disabled = true;
			snapPreset.appendChild(opt);
		}
		snapPreset.addEventListener("change", () => {
			const v = snapPreset.value;
			if (!v) return;
			const list = v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			this.#snapshotIncludePatterns = list;
			try {
				localStorage.setItem(
					"devdash.snapshot.include",
					list.join(",")
				);
			} catch {
				/* noop */
			}
			this.#updatePolicySnapshot();
			const stm =
				this.#stateManager?.managers?.systemToastManager ||
				this.#stateManager?.managers?.SystemToastManager;
			try {
				stm?.success?.("Preset applied");
			} catch {
				/* noop */
			}
			// Reset to placeholder after apply to avoid confusion
			try {
				snapPreset.selectedIndex = 0;
			} catch {
				/* noop */
			}
		});

		snapHeader.appendChild(snapFull);
		snapHeader.appendChild(snapCopy);
		snapHeader.appendChild(snapCopyAll);
		snapHeader.appendChild(snapPreset);

		// Dev tools: Reset IndexedDB (dev or policy-gated)
		const snapConfig = document.createElement("button");
		snapConfig.type = "button";
		snapConfig.className = "link-btn";
		snapConfig.textContent = "config";
		snapConfig.title =
			"Configure snapshot include patterns (comma-separated paths; wildcard * allowed)";
		// restore include patterns
		try {
			const saved = localStorage.getItem("devdash.snapshot.include");
			if (saved)
				this.#snapshotIncludePatterns = saved
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
		} catch {
			/* noop */
		}
		snapConfig.addEventListener("click", () => {
			try {
				const current = this.#snapshotIncludePatterns.join(", ");
				const input = window.prompt(
					"Enter include patterns (e.g., ui.*, grid.enable_analytics)",
					current
				);
				if (input == null) return; // cancelled
				const list = input
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				this.#snapshotIncludePatterns = list;
				try {
					localStorage.setItem(
						"devdash.snapshot.include",
						list.join(",")
					);
				} catch {
					/* noop */
				}
				this.#updatePolicySnapshot();
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.success?.("Snapshot filters updated");
				} catch {
					/* noop */
				}
			} catch (err) {
				const stm =
					this.#stateManager?.managers?.systemToastManager ||
					this.#stateManager?.managers?.SystemToastManager;
				try {
					stm?.error?.("Failed to update snapshot config");
				} catch {
					/* noop */
				}
				console.warn("[DevDashboard] Snapshot config failed:", err);
			}
		});
		snapHeader.appendChild(snapConfig);
		const resetBtn = document.createElement("button");
		resetBtn.type = "button";
		resetBtn.className = "link-btn";
		resetBtn.textContent = "reset IndexedDB";
		resetBtn.title = "Clear core stores (audit_events, system_settings)";
		// Show only if dev or policy allows
		let allowReset = false;
		try {
			const pm = this.#stateManager?.managers?.policies;
			const pol = pm?.getPolicy?.("security", "allow_storage_reset");
			const dev = !!(
				import.meta?.env?.DEV ||
				window.location.hostname === "localhost"
			);
			allowReset = typeof pol === "boolean" ? pol : dev;
		} catch {
			/* noop */
		}
		if (allowReset) {
			resetBtn.addEventListener("click", async () => {
				try {
					if (
						!window.confirm(
							"Reset IndexedDB stores (audit_events, system_settings)?"
						)
					)
						return;
					const db = this.#stateManager?.storage?.instance;
					await db?.clear?.("audit_events");
					await db?.clear?.("system_settings");
					const stm =
						this.#stateManager?.managers?.systemToastManager ||
						this.#stateManager?.managers?.SystemToastManager;
					try {
						stm?.success?.("IndexedDB stores cleared");
					} catch {
						/* noop */
					}
				} catch (err) {
					const stm =
						this.#stateManager?.managers?.systemToastManager ||
						this.#stateManager?.managers?.SystemToastManager;
					try {
						stm?.error?.("Failed to reset IndexedDB");
					} catch {
						/* noop */
					}
					console.warn("[DevDashboard] Reset IndexedDB failed:", err);
				}
			});
			snapHeader.appendChild(resetBtn);
		}
		snapWrap.append(snapHeader, snapPre);

		policyWrap.append(
			exposeRow,
			reportRow,
			hudRow,
			vlRow,
			gaRow,
			statusLine,
			snapWrap
		);
		policySection.append(policyTitle, policyWrap);
		this.#policyToggleExposeGlobal = exposeCb;
		this.#policyToggleReportErrors = reportCb;
		this.#policyToggleEnableHud = hudCb;
		this.#policyToggleEnableVL = vlCb;
		this.#policyToggleGridAnalytics = gaCb;

		// --- Event Log Section ---
		const eventLogSection = document.createElement("div");
		eventLogSection.className = "dashboard-section";
		const eventLogTitle = document.createElement("h4");
		eventLogTitle.textContent = "Event Log";
		this.#eventLogContainer = document.createElement("div");
		this.#eventLogContainer.className = "event-log-container";
		this.#eventLogContainer.textContent = "No events";
		eventLogSection.append(eventLogTitle, this.#eventLogContainer);

		// --- Bootstrap Stages Section ---
		const stagesSection = document.createElement("div");
		stagesSection.className = "dashboard-section";
		const stagesTitle = document.createElement("h4");
		stagesTitle.textContent = "Bootstrap Stages";
		// Actions: export CSV
		const stagesActions = document.createElement("div");
		stagesActions.style.display = "flex";
		stagesActions.style.gap = "8px";
		stagesActions.style.alignItems = "center";
		const exportBtn = document.createElement("button");
		exportBtn.type = "button";
		exportBtn.className = "link-btn";
		exportBtn.textContent = "export CSV";
		exportBtn.title = "Export bootstrap stages as CSV";
		exportBtn.addEventListener("click", () => {
			try {
				const rows = [["stage", "duration_ms"]].concat(
					(this.#bootstrapStages || []).map((s) => [
						s.stage,
						String(Number(s.duration || 0).toFixed(2)),
					])
				);
				const csv = rows
					.map((r) =>
						r
							.map((v) =>
								/[",\n]/.test(v)
									? '"' + String(v).replace(/"/g, '""') + '"'
									: v
							)
							.join(",")
					)
					.join("\n");
				const blob = new Blob([csv], {
					type: "text/csv;charset=utf-8",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `bootstrap_stages_${Date.now()}.csv`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} catch (err) {
				console.warn("[DevDashboard] CSV export failed:", err);
			}
		});
		stagesActions.appendChild(exportBtn);

		// Show/hide chart toggle (persisted)
		const chartToggle = document.createElement("label");
		chartToggle.style.display = "inline-flex";
		chartToggle.style.alignItems = "center";
		chartToggle.style.gap = "4px";
		const chartCb = document.createElement("input");
		chartCb.type = "checkbox";
		try {
			const saved = localStorage.getItem("devdash.stages.chart");
			if (saved != null) this.#stagesChartVisible = saved === "1";
		} catch {
			/* noop */
		}
		chartCb.checked = this.#stagesChartVisible;
		const chartTxt = document.createElement("span");
		chartTxt.textContent = "chart";
		chartToggle.append(chartCb, chartTxt);
		chartCb.addEventListener("change", () => {
			this.#stagesChartVisible = !!chartCb.checked;
			try {
				localStorage.setItem(
					"devdash.stages.chart",
					this.#stagesChartVisible ? "1" : "0"
				);
			} catch {
				/* noop */
			}
			if (this.#stagesChartCanvas)
				this.#stagesChartCanvas.style.display = this.#stagesChartVisible
					? "block"
					: "none";
			if (this.#stagesChartVisible) this.#renderBootstrapChart();
		});
		stagesActions.appendChild(chartToggle);

		this.#bootstrapStagesContainer = document.createElement("div");
		this.#bootstrapStagesContainer.className = "stages-table-container";
		this.#bootstrapStagesContainer.textContent = "No stage metrics yet";
		// Optional Chart.js canvas
		this.#stagesChartCanvas = document.createElement("canvas");
		this.#stagesChartCanvas.className = "stages-chart-canvas";
		stagesSection.append(
			stagesTitle,
			stagesActions,
			this.#bootstrapStagesContainer,
			this.#stagesChartCanvas
		);
		if (this.#stagesChartCanvas)
			this.#stagesChartCanvas.style.display = this.#stagesChartVisible
				? "block"
				: "none";

		// Assemble dashboard
		content.append(
			perfSection,
			coreSection,
			policySection,
			stagesSection,
			eventLogSection
		);
		this.#dashboardElement.append(header, content);
		this.#container.appendChild(this.#dashboardElement);
	}

	/**
	 * Helper to create a performance metric item.
	 * @param {string} label - The label for the metric.
	 * @param {string} initialValue - The initial value.
	 * @returns {HTMLSpanElement} The value element for the metric.
	 * @private
	 */
	#createPerfItem(label, initialValue) {
		const item = document.createElement("div");
		item.className = "perf-item";
		const strong = document.createElement("strong");
		strong.textContent = `${label}:`;
		const valueSpan = document.createElement("span");
		valueSpan.textContent = ` ${initialValue}`;
		item.append(strong, valueSpan);
		this.#perfMetricsContainer.appendChild(item);
		return valueSpan;
	}

	/**
	 * Attaches event listeners for dashboard interactions.
	 * @private
	 */
	#attachEventListeners() {
		this.#toggleBtn.addEventListener("click", () => this.toggle());
		this.#dashboardElement
			.querySelector(".dashboard-header")
			.addEventListener("click", (e) => {
				if (e.target !== this.#toggleBtn) {
					this.toggle();
				}
			});

		// Policy toggle handlers
		const policies = this.#stateManager?.managers?.policies;
		if (policies) {
			this.#policyToggleExposeGlobal?.addEventListener?.(
				"change",
				async (e) => {
					if (!this.#canClientUpdate) {
						try {
							e.target.checked = !!policies.getPolicy(
								"security",
								"expose_global_namespace"
							);
						} catch {
							/* noop */
						}
						console.warn(
							"[DevDashboard] Client policy updates disabled; change ignored."
						);
						return;
					}
					try {
						await policies.update(
							"security",
							"expose_global_namespace",
							!!e.target.checked
						);
						console.log(
							"[DevDashboard] Updated policy: security.expose_global_namespace =",
							e.target.checked
						);
					} catch (err) {
						console.warn(
							"[DevDashboard] Failed to update expose_global_namespace:",
							err
						);
					}
				}
			);
			this.#policyToggleReportErrors?.addEventListener?.(
				"change",
				async (e) => {
					if (!this.#canClientUpdate) {
						try {
							e.target.checked = !!policies.getPolicy(
								"security",
								"report_unhandled_errors"
							);
						} catch {
							/* noop */
						}
						console.warn(
							"[DevDashboard] Client policy updates disabled; change ignored."
						);
						return;
					}
					try {
						await policies.update(
							"security",
							"report_unhandled_errors",
							!!e.target.checked
						);
						console.log(
							"[DevDashboard] Updated policy: security.report_unhandled_errors =",
							e.target.checked
						);
					} catch (err) {
						console.warn(
							"[DevDashboard] Failed to update report_unhandled_errors:",
							err
						);
					}
				}
			);
			this.#policyToggleEnableHud?.addEventListener?.(
				"change",
				async (e) => {
					if (!this.#canClientUpdate) {
						try {
							e.target.checked = !!policies.getPolicy(
								"ui",
								"enable_security_hud"
							);
						} catch {
							/* noop */
						}
						console.warn(
							"[DevDashboard] Client policy updates disabled; change ignored."
						);
						return;
					}
					try {
						await policies.update(
							"ui",
							"enable_security_hud",
							!!e.target.checked
						);
						console.log(
							"[DevDashboard] Updated policy: ui.enable_security_hud =",
							e.target.checked
						);
					} catch (err) {
						console.warn(
							"[DevDashboard] Failed to update ui.enable_security_hud:",
							err
						);
					}
				}
			);
			this.#policyToggleEnableVL?.addEventListener?.(
				"change",
				async (e) => {
					if (!this.#canClientUpdate) {
						try {
							e.target.checked = !!policies.getPolicy(
								"ui",
								"enable_virtual_list"
							);
						} catch {
							/* noop */
						}
						console.warn(
							"[DevDashboard] Client policy updates disabled; change ignored."
						);
						return;
					}
					try {
						await policies.update(
							"ui",
							"enable_virtual_list",
							!!e.target.checked
						);
						console.log(
							"[DevDashboard] Updated policy: ui.enable_virtual_list =",
							e.target.checked
						);
					} catch (err) {
						console.warn(
							"[DevDashboard] Failed to update ui.enable_virtual_list:",
							err
						);
					}
				}
			);
			this.#policyToggleGridAnalytics?.addEventListener?.(
				"change",
				async (e) => {
					if (!this.#canClientUpdate) {
						try {
							e.target.checked = !!policies.getPolicy(
								"grid",
								"enable_analytics"
							);
						} catch {
							/* noop */
						}
						console.warn(
							"[DevDashboard] Client policy updates disabled; change ignored."
						);
						return;
					}
					try {
						await policies.update(
							"grid",
							"enable_analytics",
							!!e.target.checked
						);
						console.log(
							"[DevDashboard] Updated policy: grid.enable_analytics =",
							e.target.checked
						);
					} catch (err) {
						console.warn(
							"[DevDashboard] Failed to update grid.enable_analytics:",
							err
						);
					}
				}
			);
		}
	}

	/**
	 * Subscribes to relevant events from the EventFlowEngine.
	 * @private
	 */
	#subscribeToEvents() {
		const eventsToLog = [
			"cache_audit",
			"stack_eviction",
			"performance_alert",
			"error", // V8.0 Parity: Listen for standardized error events
		];
		eventsToLog.forEach((eventName) => {
			const unsub = this.#stateManager.on(eventName, (payload) =>
				this.#logEvent(eventName, payload)
			);
			this.#unsubscribe.push(unsub);
		});
		console.log("[DevDashboard] Subscribed to system events.");

		// Reflect live policy changes in the toggles
		const unsubPolicy = this.#stateManager.on("policyEvent", (evt) => {
			try {
				const { type, data } = evt || {};
				if (type === "policy_updated" && data?.domain === "security") {
					if (
						data.key === "expose_global_namespace" &&
						this.#policyToggleExposeGlobal
					) {
						this.#policyToggleExposeGlobal.checked =
							!!data.newValue;
					}
					if (
						data.key === "report_unhandled_errors" &&
						this.#policyToggleReportErrors
					) {
						this.#policyToggleReportErrors.checked =
							!!data.newValue;
					}
					if (data.key === "allow_client_policy_updates") {
						this.#canClientUpdate = !!data.newValue;
						// Respect existing disabled flags (e.g., prod readonly)
						if (this.#policyToggleExposeGlobal) {
							this.#policyToggleExposeGlobal.disabled =
								!this.#canClientUpdate ||
								this.#policyToggleExposeGlobal.disabled;
						}
						if (this.#policyToggleReportErrors) {
							this.#policyToggleReportErrors.disabled =
								!this.#canClientUpdate ||
								this.#policyToggleReportErrors.disabled;
						}
						this.#updatePolicyStatusLine({
							can: this.#canClientUpdate,
						});
					}
					// UI domain policies
					if (data.domain === "ui") {
						if (
							data.key === "enable_security_hud" &&
							this.#policyToggleEnableHud
						) {
							this.#policyToggleEnableHud.checked =
								!!data.newValue;
							this.#policyToggleEnableHud.disabled =
								!this.#canClientUpdate ||
								this.#policyToggleEnableHud.disabled;
						}
						if (
							data.key === "enable_virtual_list" &&
							this.#policyToggleEnableVL
						) {
							this.#policyToggleEnableVL.checked =
								!!data.newValue;
							this.#policyToggleEnableVL.disabled =
								!this.#canClientUpdate ||
								this.#policyToggleEnableVL.disabled;
						}
					}
					// Grid domain policies
					if (data.domain === "grid") {
						if (
							data.key === "enable_analytics" &&
							this.#policyToggleGridAnalytics
						) {
							this.#policyToggleGridAnalytics.checked =
								!!data.newValue;
							this.#policyToggleGridAnalytics.disabled =
								!this.#canClientUpdate ||
								this.#policyToggleGridAnalytics.disabled;
						}
					}
					// Refresh header flag summary on any relevant policy update
					this.#updateFlagSummary();
					// Log policy changes into the dashboard event log
					this.#logEvent("policy_updated", {
						source: "policy",
						policy: `${data.domain}.${data.key}`,
						oldValue: data.oldValue,
						newValue: data.newValue,
					});
					// Refresh policy snapshot
					this.#updatePolicySnapshot();
				}
			} catch {
				/* noop */
			}
		});
		this.#unsubscribe.push(unsubPolicy);

		// Listen for bootstrap stage metrics
		const unsubMetrics = this.#stateManager.on("metrics", (payload) => {
			try {
				if (payload?.type === "bootstrap.stage") {
					this.#bootstrapStages.push({
						stage: payload.stage,
						duration: payload.duration,
					});
					this.#renderBootstrapStages();
					this.#renderBootstrapChart();
				}
			} catch {
				/* noop */
			}
		});
		this.#unsubscribe.push(unsubMetrics);
	}

	#updatePolicyStatusLine({
		can,
		isDev,
		hasPermission,
		canUpdatePolicy,
	} = {}) {
		if (!this.#policyStatusEl) return;
		const prod = !!import.meta?.env?.PROD;
		const dev = !!(
			import.meta?.env?.DEV || window.location.hostname === "localhost"
		);
		const status = can ?? this.#canClientUpdate;
		let reason = "";
		if (!status) {
			if (prod) reason = "prod";
			if (canUpdatePolicy === false) reason = reason || "policy";
			if (hasPermission === false) reason = reason || "no permission";
		}

		const msg = status
			? "Policy updates: enabled"
			: `Policy updates: locked${reason ? ` (${reason})` : ""}`;

		try {
			const subject =
				this.#stateManager?.managers?.securityManager?.getSubject?.() ||
				{};
			const perms = Array.isArray(subject.permissions)
				? subject.permissions.join(", ")
				: "none";
			this.#policyStatusEl.title = `Requires permission: ${this.#policyAdminPermission}. User role: ${subject.role || "unknown"}. User perms: ${perms}.`;
		} catch {
			/* noop */
		}

		this.#policyStatusEl.className = `status-line ${status ? "enabled" : "locked"}`;
		while (this.#policyStatusEl.firstChild)
			this.#policyStatusEl.removeChild(this.#policyStatusEl.firstChild);

		const textEl = document.createElement("span");
		textEl.textContent = `${msg} (perm: ${this.#policyAdminPermission})`;
		this.#policyStatusEl.appendChild(textEl);

		if (dev) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "link-btn";
			btn.textContent = "change";
			btn.title =
				"Set security.policy_admin_permission (dev only helper)";
			btn.addEventListener("click", () => {
				try {
					const newPerm = window.prompt(
						"Enter new policy admin permission (string)",
						this.#policyAdminPermission || "policy.admin"
					);
					if (
						!newPerm ||
						typeof newPerm !== "string" ||
						!newPerm.trim()
					)
						return;
					const policies = this.#stateManager?.managers?.policies;
					if (!policies?.update) return;
					policies
						.update(
							"security",
							"policy_admin_permission",
							newPerm.trim()
						)
						.then(() => {
							this.#policyAdminPermission = newPerm.trim();
							this.#updatePolicyStatusLine({
								can: this.#canClientUpdate,
							});
							const stm =
								this.#stateManager?.managers
									?.systemToastManager ||
								this.#stateManager?.managers
									?.SystemToastManager;
							try {
								stm?.success?.(
									`Policy admin permission set: ${this.#policyAdminPermission}`
								);
							} catch {
								/* noop */
							}
							console.info(
								"[DevDashboard] Updated security.policy_admin_permission to:",
								this.#policyAdminPermission
							);
						})
						.catch((err) => {
							const stm =
								this.#stateManager?.managers
									?.systemToastManager ||
								this.#stateManager?.managers
									?.SystemToastManager;
							try {
								stm?.error?.(
									"Failed to update policy_admin_permission"
								);
							} catch {
								/* noop */
							}
							console.warn(
								"[DevDashboard] Failed to update policy_admin_permission:",
								err
							);
						});
				} catch {
					/* noop */
				}
			});
			const sep = document.createElement("span");
			sep.textContent = " ";
			this.#policyStatusEl.appendChild(sep);
			this.#policyStatusEl.appendChild(btn);
		}
	}

	#updateFlagSummary({ hud, vl, ga } = {}) {
		try {
			const policies = this.#stateManager?.managers?.policies;
			if (hud === undefined)
				hud = !!policies?.getPolicy?.("ui", "enable_security_hud");
			if (vl === undefined) {
				const v = policies?.getPolicy?.("ui", "enable_virtual_list");
				vl = typeof v === "boolean" ? v : true;
			}
			if (ga === undefined) {
				const g = policies?.getPolicy?.("grid", "enable_analytics");
				ga = typeof g === "boolean" ? g : true;
			}
			if (this.#flagSummaryEl) {
				// Clear any previous content
				while (this.#flagSummaryEl.firstChild)
					this.#flagSummaryEl.removeChild(
						this.#flagSummaryEl.firstChild
					);
				const label = document.createElement("span");
				label.textContent = "Flags:";
				this.#flagSummaryEl.appendChild(label);

				const mk = (key, on) => {
					const b = document.createElement("span");
					b.className = `flag-badge ${on ? "on" : "off"}`;
					b.textContent = `${key}: ${on ? "ON" : "OFF"}`;
					// Per-badge tooltip mapping
					const map = {
						HUD: "Security HUD (ui.enable_security_hud)",
						VL: "Virtual List (ui.enable_virtual_list)",
						GA: "Grid Analytics (grid.enable_analytics)",
					};
					b.title = map[key] || key;
					// Dev-only: click-to-toggle when client updates allowed
					try {
						const dev = !!(
							import.meta?.env?.DEV ||
							window.location.hostname === "localhost"
						);
						if (dev && this.#canClientUpdate) {
							b.classList.add("clickable");
							b.addEventListener("click", async () => {
								try {
									const pm =
										this.#stateManager?.managers?.policies;
									if (!pm?.update) return;
									let domain = "ui",
										policyKey = "";
									if (key === "HUD") {
										policyKey = "enable_security_hud";
									} else if (key === "VL") {
										policyKey = "enable_virtual_list";
									} else if (key === "GA") {
										domain = "grid";
										policyKey = "enable_analytics";
									}
									await pm.update(domain, policyKey, !on);
									this.#updateFlagSummary();
									const stm =
										this.#stateManager?.managers
											?.systemToastManager ||
										this.#stateManager?.managers
											?.SystemToastManager;
									try {
										stm?.success?.(
											`${policyKey} set to ${!on ? "ON" : "OFF"}`
										);
									} catch {
										/* noop */
									}
								} catch (err) {
									const stm =
										this.#stateManager?.managers
											?.systemToastManager ||
										this.#stateManager?.managers
											?.SystemToastManager;
									try {
										stm?.error?.("Failed to update flag");
									} catch {
										/* noop */
									}
									console.warn(
										"[DevDashboard] Failed to toggle flag badge:",
										err
									);
								}
							});
						}
					} catch {
						/* noop */
					}
					return b;
				};
				this.#flagSummaryEl.appendChild(mk("HUD", !!hud));
				this.#flagSummaryEl.appendChild(mk("VL", !!vl));
				this.#flagSummaryEl.appendChild(mk("GA", !!ga));
				const legend =
					"Legend: HUD=Security HUD; VL=Virtual List; GA=Grid Analytics";
				this.#flagSummaryEl.title = legend;
				this.#flagSummaryEl.setAttribute("aria-label", legend);
			}
		} catch {
			/* noop */
		}
	}

	#updatePolicySnapshot() {
		try {
			if (!this.#policySnapshotPre) return;
			const snap = this.#buildPolicySnapshot();
			this.#policySnapshotPre.textContent = JSON.stringify(snap, null, 2);
		} catch {
			/* noop */
		}
	}

	#renderBootstrapStages() {
		try {
			if (!this.#bootstrapStagesContainer) return;
			const rows = (this.#bootstrapStages || [])
				.map(
					(s) =>
						`<tr><td>${s.stage}</td><td style="text-align:right">${Number(s.duration).toFixed(2)} ms</td></tr>`
				)
				.join("");
			this.#bootstrapStagesContainer.innerHTML = rows
				? `<table class="stages"><thead><tr><th>Stage</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table>`
				: "No stage metrics yet";
		} catch {
			/* noop */
		}
	}

	async #renderBootstrapChart() {
		try {
			const ctx = this.#stagesChartCanvas?.getContext?.("2d");
			if (!ctx) return;
			const labels = (this.#bootstrapStages || []).map((s) => s.stage);
			const data = (this.#bootstrapStages || []).map((s) =>
				Number(s.duration || 0)
			);
			if (labels.length === 0) return;
			if (typeof window !== "undefined" && !window.Chart) {
				try {
					await import(/* @vite-ignore */ "chart.js/auto");
				} catch {
					/* noop */
				}
			}
			if (!window.Chart) return;
			if (this.#stagesChart) {
				this.#stagesChart.data.labels = labels;
				this.#stagesChart.data.datasets[0].data = data;
				this.#stagesChart.update();
			} else {
				this.#stagesChart = new window.Chart(ctx, {
					type: "bar",
					data: {
						labels,
						datasets: [
							{
								label: "Duration (ms)",
								data,
								backgroundColor: "#4e9cff",
							},
						],
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: { legend: { display: false } },
						scales: { y: { title: { display: true, text: "ms" } } },
					},
				});
			}
		} catch {
			/* noop */
		}
	}

	#buildPolicySnapshot() {
		const snap = {};
		try {
			const pm = this.#stateManager?.managers?.policies;
			if (!pm?.getPolicy) return { error: "PolicyManager not available" };

			if (this.#snapshotModeFull) {
				return pm.getAllPolicies
					? pm.getAllPolicies()
					: { error: "getAllPolicies not available" };
			}

			const keysToInclude = new Set([
				"security.expose_global_namespace",
				"security.report_unhandled_errors",
				"security.allow_client_policy_updates",
				"security.policy_admin_permission",
				"ui.enable_security_hud",
				"ui.enable_virtual_list",
				"grid.enable_analytics",
			]);

			if (this.#snapshotIncludePatterns.length > 0) {
				const allKeys = pm.getAllPolicyKeys
					? pm.getAllPolicyKeys()
					: [];
				for (const pattern of this.#snapshotIncludePatterns) {
					if (pattern === "*") {
						allKeys.forEach((k) => keysToInclude.add(k));
						break;
					}
					const regex = new RegExp(
						`^${pattern.replace(/\*/g, ".*")}$`
					);
					for (const key of allKeys) {
						if (regex.test(key)) keysToInclude.add(key);
					}
				}
			}

			for (const key of keysToInclude) {
				const [domain, ...rest] = key.split(".");
				snap[key] = pm.getPolicy(domain, rest.join("."));
			}
		} catch {
			/* noop */
		}
		return snap;
	}

	/**
	 * Toggles the dashboard between its collapsed and expanded states.
	 */
	toggle() {
		if (this.#dashboardElement.classList.contains("collapsed")) {
			this.open();
		} else {
			this.close();
		}
	}

	/**
	 * Expands the dashboard and starts the live metric updates.
	 */
	open() {
		this.#dashboardElement.classList.remove("collapsed");
		this.#toggleBtn.textContent = "Collapse";
		this.#updateMetrics(); // Initial update
		this.#updateInterval = setInterval(() => this.#updateMetrics(), 1000);
	}

	/**
	 * Collapses the dashboard and stops the live metric updates.
	 */
	close() {
		this.#dashboardElement.classList.add("collapsed");
		this.#toggleBtn.textContent = "Expand";
		if (this.#updateInterval) {
			clearInterval(this.#updateInterval);
			this.#updateInterval = null;
		}
	}

	/**
	 * Fetches the latest metrics from the reporter and updates the DOM.
	 * @private
	 */
	#updateMetrics() {
		if (!this.#reporter) return;
		const summary = this.#reporter.getCurrentSummary();

		// Update performance metrics
		const memory = summary.memory
			? (summary.memory.jsHeapUsed / 1024 / 1024).toFixed(2)
			: "N/A";

		this.#perfMetrics.fps.textContent = ` ${summary.fps}`;
		this.#perfMetrics.latency.textContent = ` ${summary.latency.render.toFixed(
			2
		)}ms`;
		this.#perfMetrics.memory.textContent = ` ${memory} MB`;

		// Update core metrics table
		this.#coreMetricsContainer.innerHTML = ""; // Clear previous content safely
		const table = document.createElement("table");
		const thead = document.createElement("thead");
		thead.innerHTML = "<tr><th>Metric</th><th>Value</th></tr>"; // Static, safe
		const tbody = document.createElement("tbody");

		for (const [key, metric] of Object.entries(summary.core || {})) {
			const row = tbody.insertRow();
			const keyCell = row.insertCell();
			const valueCell = row.insertCell();
			keyCell.textContent = key;

			let value = "";
			if (metric.type === "counter") {
				value = metric.value;
			} else if (metric.type === "timer") {
				value = `avg: ${metric.avg.toFixed(2)}ms (count: ${
					metric.count
				})`;
			} else if (metric.type === "histogram") {
				value = `avg: ${metric.avg.toFixed(2)} (count: ${
					metric.count
				})`;
			}
			valueCell.textContent = value;
		}
		table.append(thead, tbody);
		this.#coreMetricsContainer.appendChild(table);
	}

	/**
	 * Updates the event log in the UI by rendering the latest events.
	 * @private
	 */
	#updateEventLog() {
		this.#eventLogContainer.innerHTML = this.#eventLog
			.toArray()
			.map(this.#renderEventLogItem)
			.join("");
	}

	/**
	 * Injects the necessary CSS for the dashboard into the document's head.
	 * @private
	 */
	#initStyles() {
		const styleId = "dev-dashboard-styles";
		if (document.getElementById(styleId)) return;

		const style = document.createElement("style");
		style.id = styleId;
		style.innerHTML = `
      .dev-dashboard {
        position: fixed;
        bottom: 10px;
        left: 10px;
        width: 450px;
        max-height: 50vh;
        background-color: rgba(30, 30, 30, 0.9);
        color: #eee;
        border: 1px solid #444;
        border-radius: 8px;
        z-index: 2000;
        font-family: "SF Mono", "Consolas", "Menlo", monospace;
        font-size: 12px;
        transition: transform 0.3s ease-in-out;
        overflow: hidden;
      }
      .dev-dashboard.collapsed {
        transform: translateY(calc(100% - 40px));
      }
      .dev-dashboard .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 15px;
        background-color: #333;
        cursor: pointer;
      }
      .dev-dashboard .dashboard-header h3 { margin: 0; font-size: 14px; }
      .dev-dashboard .dashboard-toggle-btn { background: #555; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
      .dev-dashboard .dashboard-content { padding: 15px; overflow-y: auto; max-height: calc(50vh - 40px); }
      .dev-dashboard .dashboard-section { margin-bottom: 15px; }
      .dev-dashboard #perf-metrics { display: flex; justify-content: space-around; background: #2a2a2a; padding: 10px; border-radius: 4px; }
      .dev-dashboard .metrics-table-container { max-height: 200px; overflow-y: auto; border: 1px solid #444; }
      .dev-dashboard table { width: 100%; border-collapse: collapse; }
      .dev-dashboard th, .dev-dashboard td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #444; }
      .dev-dashboard th { background-color: #3a3a3a; position: sticky; top: 0; z-index: 1; }
      .dev-dashboard tr:nth-child(even) { background-color: #2c2c2c; }
      .dev-dashboard .event-log-container { max-height: 150px; overflow-y: auto; border: 1px solid #444; padding: 5px; background: #2a2a2a; }
      .dev-dashboard .event-log-item { padding: 4px; border-bottom: 1px solid #383838; display: flex; justify-content: space-between; align-items: center; }
      .dev-dashboard .event-log-item:last-child { border-bottom: none; }
      .dev-dashboard .event-log-name { font-weight: 600; color: #9cdcfe; }
      .dev-dashboard .event-log-source { color: #ce9178; }
      .dev-dashboard .event-log-time { color: #888; font-size: 10px; }
      .dev-dashboard .policy-controls label.readonly { opacity: 0.6; }
      .dev-dashboard .policy-controls .badge { margin-left: 6px; font-size: 10px; padding: 1px 4px; border-radius: 3px; background: #555; color: #eee; border: 1px solid #666; }
      .dev-dashboard .policy-controls .readonly-badge { background: #444; color: #bbb; }
      .dev-dashboard .status-line { margin-top: 8px; font-size: 11px; color: #bbb; }
      .dev-dashboard .status-line.enabled { color: #a6e22e; }
      .dev-dashboard .status-line.locked { color: #f92672; }
      .dev-dashboard .dashboard-header .flag-summary { margin: 0 8px; font-size: 11px; color: #bbb; }
      .dev-dashboard .dashboard-header .flag-summary .flag-badge { margin-left: 6px; font-size: 10px; padding: 1px 6px; border-radius: 10px; border: 1px solid transparent; }
      .dev-dashboard .dashboard-header .flag-summary .flag-badge.on { background: #28a745; color: #fff; border-color: #1e7e34; }
      .dev-dashboard .dashboard-header .flag-summary .flag-badge.off { background: #dc3545; color: #fff; border-color: #c82333; }
      .dev-dashboard .dashboard-header .flag-summary .flag-badge.clickable { cursor: pointer; text-decoration: underline; }
      .dev-dashboard .policy-snapshot { margin-top: 8px; border: 1px solid #444; background: #2a2a2a; border-radius: 4px; }
      .dev-dashboard .policy-snapshot-header { padding: 4px 8px; background: #3a3a3a; font-weight: 600; }
      .dev-dashboard .policy-snapshot-header .link-btn { margin-left: 8px; background: none; border: none; color: #9cdcfe; cursor: pointer; text-decoration: underline; padding: 0; }
      .dev-dashboard .policy-snapshot pre { margin: 0; padding: 8px; max-height: 160px; overflow: auto; color: #ddd; }
      .dev-dashboard .stages-table-container table { width: 100%; border-collapse: collapse; }
      .dev-dashboard .stages-table-container th, .dev-dashboard .stages-table-container td { padding: 4px 8px; border-bottom: 1px solid #444; }
      .dev-dashboard .stages-chart-canvas { width: 100%; height: 180px; display: block; }
      .dev-dashboard .status-line .link-btn { margin-left: 6px; background: none; border: none; color: #9cdcfe; cursor: pointer; text-decoration: underline; padding: 0; }
    `;
		document.head.appendChild(style);
	}

	/**
	 * Adds an event to the log and triggers a UI update.
	 * @private
	 * @param {string} name - The name of the event.
	 * @param {object} payload - The event payload.
	 */
	#logEvent(name, payload) {
		this.#eventLog.push({
			name,
			payload,
			loggedAt: new Date(DateCore.timestamp()),
		});
		if (!this.#dashboardElement.classList.contains("collapsed")) {
			this.#updateEventLog();
		}
	}

	/**
	 * Renders a single event log item as an HTML string.
	 * @private
	 * @param {{name: string, payload: object, loggedAt: Date}} logEntry - The event log entry object.
	 * @returns {string} The HTML string for the log item.
	 */
	#renderEventLogItem({ name, payload, loggedAt }) {
		const time = loggedAt.toLocaleTimeString([], { hour12: false });
		// V8.0 Parity: Standardize source/component from payload
		const source = payload.source || payload.component || "system";

		const item = document.createElement("div");
		item.className = "event-log-item";

		const nameSpan = document.createElement("span");
		nameSpan.className = "event-log-name";
		nameSpan.textContent = name;

		const sourceSpan = document.createElement("span");
		sourceSpan.className = "event-log-source";
		sourceSpan.textContent = source;

		const timeSpan = document.createElement("span");
		timeSpan.className = "event-log-time";
		timeSpan.textContent = time;

		item.append(nameSpan, sourceSpan, timeSpan);
		return item.outerHTML;
	}

	/**
	 * Cleans up the dashboard, removing elements and listeners.
	 */
	destroy() {
		if (this.#updateInterval) clearInterval(this.#updateInterval);
		this.#unsubscribe.forEach((unsub) => unsub());
		this.#dashboardElement?.remove();
		const styleElement = document.getElementById("dev-dashboard-styles");
		styleElement?.remove();
		console.log("[DevDashboard] Destroyed.");
	}
}
