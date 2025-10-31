import { BoundedStack } from "../src/utils/BoundedStack.js";
import { DateCore } from "../src/utils/DateUtils.js";

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
	#unsubscribe = [];

	/**
	 * Creates an instance of DeveloperDashboard.
	 * @param {HTMLElement} container - The DOM element to which the dashboard will be appended.
	 * @param {object} dependencies - The required dependencies for the dashboard.
	 * @param {import('../src/core/HybridStateManager.js').default} dependencies.stateManager - The application's HybridStateManager instance.
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
		this.#toggleBtn = document.createElement("button");
		this.#toggleBtn.className = "dashboard-toggle-btn";
		this.#toggleBtn.textContent = this.#options.startOpen
			? "Collapse"
			: "Expand";
		header.append(title, this.#toggleBtn);

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

		// --- Event Log Section ---
		const eventLogSection = document.createElement("div");
		eventLogSection.className = "dashboard-section";
		const eventLogTitle = document.createElement("h4");
		eventLogTitle.textContent = "Event Log";
		this.#eventLogContainer = document.createElement("div");
		this.#eventLogContainer.className = "event-log-container";
		this.#eventLogContainer.textContent = "No events";
		eventLogSection.append(eventLogTitle, this.#eventLogContainer);

		// Assemble dashboard
		content.append(perfSection, coreSection, eventLogSection);
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
