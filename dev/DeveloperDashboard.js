import { BoundedStack } from "../src/utils/BoundedStack.js";
import { DateCore } from "../src/utils/DateUtils.js";

/**
 * @class DeveloperDashboard
 * @description A floating UI component that provides a real-time view of application
 * performance and custom metrics by hooking into a MetricsReporter instance.
 */
export class DeveloperDashboard {
	/**
	 * Creates an instance of DeveloperDashboard.
	 * @param {HTMLElement} container - The DOM element to which the dashboard will be appended.
	 * @param {object} dependencies - The required dependencies for the dashboard.
	 * @param {import('../src/utils/MetricsReporter').MetricsReporter} dependencies.metricsReporter - The application's MetricsReporter instance.
	 * @param {object} [dependencies.eventFlow=null] - The application's EventFlowEngine instance.
	 * @param {object} [options={}] - Configuration options.
	 * @param {boolean} [options.startOpen=false] - Whether the dashboard should be open by default.
	 */
	constructor(
		container,
		{ metricsReporter, eventFlow = null },
		options = {}
	) {
		if (!container || !metricsReporter) {
			throw new Error(
				"DeveloperDashboard requires a container element and a MetricsReporter instance."
			);
		}

		this.container = container;
		this.reporter = metricsReporter;
		this.eventFlow = eventFlow;
		this.options = {
			startOpen: false,
			...options,
		};
		this.updateInterval = null;

		// Use a BoundedStack to keep the event log from growing indefinitely.
		this.eventLog = new BoundedStack(50);

		this.initStyles();
		this.render();
		this.attachEventListeners();
		if (this.eventFlow) {
			this.subscribeToEvents();
		}

		if (this.options.startOpen) {
			this.open();
		}
	}

	/**
	 * Renders the initial structure of the dashboard component.
	 * @private
	 */
	render() {
		this.dashboardElement = document.createElement("div");
		this.dashboardElement.className = "dev-dashboard";
		if (!this.options.startOpen) {
			this.dashboardElement.classList.add("collapsed");
		}

		this.dashboardElement.innerHTML = `
      <div class="dashboard-header">
        <h3>Dev Dashboard</h3>
        <button class="dashboard-toggle-btn">${this.options.startOpen ? "Collapse" : "Expand"}</button>
      </div>
      <div class="dashboard-content">
        <div class="dashboard-section" id="perf-metrics"></div>
        <div class="dashboard-section" id="core-metrics">
          <h4>Core Metrics</h4>
          <div class="metrics-table-container"></div>
        </div>
        <div class="dashboard-section" id="event-log">
          <h4>Event Log</h4>
          <div class="event-log-container"></div>
        </div>
      </div>
    `;

		this.container.appendChild(this.dashboardElement);
		this.toggleBtn = this.dashboardElement.querySelector(
			".dashboard-toggle-btn"
		);
		this.perfMetricsContainer =
			this.dashboardElement.querySelector("#perf-metrics");
		this.coreMetricsContainer = this.dashboardElement.querySelector(
			"#core-metrics .metrics-table-container"
		);
		this.eventLogContainer = this.dashboardElement.querySelector(
			"#event-log .event-log-container"
		);
	}

	/**
	 * Attaches event listeners for dashboard interactions.
	 * @private
	 */
	attachEventListeners() {
		this.toggleBtn.addEventListener("click", () => this.toggle());
		this.dashboardElement
			.querySelector(".dashboard-header")
			.addEventListener("click", (e) => {
				if (e.target !== this.toggleBtn) {
					this.toggle();
				}
			});
	}

	/**
	 * Subscribes to relevant events from the EventFlowEngine.
	 * @private
	 */
	subscribeToEvents() {
		const eventsToLog = [
			"cache_audit",
			"stack_eviction",
			"performance_alert",
		];
		eventsToLog.forEach((eventName) => {
			this.eventFlow.on(eventName, (payload) =>
				this.logEvent(eventName, payload)
			);
		});
		console.log("[DevDashboard] Subscribed to system events.");
	}

	/**
	 * Toggles the dashboard between its collapsed and expanded states.
	 */
	toggle() {
		if (this.dashboardElement.classList.contains("collapsed")) {
			this.open();
		} else {
			this.close();
		}
	}

	/**
	 * Expands the dashboard and starts the live metric updates.
	 */
	open() {
		this.dashboardElement.classList.remove("collapsed");
		this.toggleBtn.textContent = "Collapse";
		this.updateMetrics(); // Initial update
		this.updateInterval = setInterval(() => this.updateMetrics(), 1000);
	}

	/**
	 * Collapses the dashboard and stops the live metric updates.
	 */
	close() {
		this.dashboardElement.classList.add("collapsed");
		this.toggleBtn.textContent = "Expand";
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/**
	 * Fetches the latest metrics from the reporter and updates the DOM.
	 * @private
	 */
	updateMetrics() {
		const summary = this.reporter.getCurrentSummary();

		// Update performance metrics
		const memory = summary.memory
			? (summary.memory.jsHeapUsed / 1024 / 1024).toFixed(2)
			: "N/A";
		this.perfMetricsContainer.innerHTML = `
      <div class="perf-item"><strong>FPS:</strong> ${summary.fps}</div>
      <div class="perf-item"><strong>Latency:</strong> ${summary.latency.render.toFixed(2)}ms</div>
      <div class="perf-item"><strong>Memory:</strong> ${memory} MB</div>
    `;

		// Update core metrics table
		let coreHtml =
			"<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>";
		for (const [key, metric] of Object.entries(summary.core)) {
			let value = "";
			if (metric.type === "counter") {
				value = metric.value;
			} else if (metric.type === "timer") {
				value = `avg: ${metric.avg.toFixed(2)}ms (count: ${metric.count})`;
			} else if (metric.type === "histogram") {
				value = `avg: ${metric.avg.toFixed(2)} (count: ${metric.count})`;
			}
			coreHtml += `<tr><td>${key}</td><td>${value}</td></tr>`;
		}
		coreHtml += "</tbody></table>";
		this.coreMetricsContainer.innerHTML = coreHtml;
	}
	updateEventLog() {
		this.eventLogContainer.innerHTML = this.eventLog
			.toArray()
			.map(this.renderEventLogItem)
			.join("");
	}

	/**
	 * Injects the necessary CSS for the dashboard into the document's head.
	 * @private
	 */
	initStyles() {
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
	logEvent(name, payload) {
		this.eventLog.push({
			name,
			payload,
			loggedAt: new Date(DateCore.timestamp()),
		});
		if (!this.dashboardElement.classList.contains("collapsed")) {
			this.updateEventLog();
		}
	}

	/**
	 * Renders a single event log item as an HTML string.
	 * @private
	 * @param {object} logEntry - The event log entry object.
	 * @returns {string} The HTML string for the log item.
	 */
	renderEventLogItem({ name, payload, loggedAt }) {
		const time = loggedAt.toLocaleTimeString([], { hour12: false });
		const source = payload.source || "system";
		return `<div class="event-log-item"><span class="event-log-name">${name}</span> <span class="event-log-source">${source}</span> <span class="event-log-time">${time}</span></div>`;
	}
}
